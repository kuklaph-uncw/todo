import { localDateString } from "../lib/date";
import type { Priority, Status } from "../lib/validation";
import { allSubtasks } from "../vault/format";
import { contentRevision } from "../vault/revision";
import type { Vault } from "../vault/vault";

export interface TodoCommand {
  requestId: string;
  id?: string;
  expectedRevision?: string;
  task?: string;
  priority?: Priority | null;
  notes?: string;
  status?: Status;
  completedOn?: string;
  text?: string;
  subtaskId?: string;
  done?: boolean;
}

/** Shared by per-request MCP instances. All mutations remain synchronous in the app's one process. */
export class TodoService {
  private readonly requests = new Map<string, { fingerprint: string; result: object }>();
  constructor(
    private readonly vault: Vault,
    private readonly clock: () => Date,
  ) {}

  list(filters: { status?: Status; q?: string; tag?: string }) {
    const q = filters.q?.toLowerCase() ?? "";
    const todos = this.vault
      .peekTodos()
      .filter(
        (todo) =>
          (!filters.status || todo.status === filters.status) &&
          (!filters.tag || todo.tags.includes(filters.tag)) &&
          (!q ||
            [todo.task, todo.notes, ...todo.tags, ...todo.goals, ...allSubtasks(todo.subtasks).map((s) => s.text)]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      );
    return {
      today: localDateString(this.clock()),
      todos: todos.map((todo) => ({ ...todo, revision: contentRevision(todo) })),
    };
  }

  get(id: string) {
    const todo = this.vault.peekTodos().find((todo) => todo.id === id && id !== "");
    if (!todo) throw new Error("Todo not found. Refresh the task list.");
    return { ...todo, revision: contentRevision(todo) };
  }

  execute(name: string, input: TodoCommand): object {
    const fingerprint = contentRevision({ name, input });
    const previous = this.requests.get(input.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error("This requestId was already used for a different operation.");
      return previous.result;
    }
    const today = localDateString(this.clock());
    let result: object;
    if (name === "add_todo") {
      const todo = this.vault.addTodo(
        {
          task: input.task!,
          priority: input.priority ?? null,
          notes: input.notes ?? "",
          status: "Open",
          tags: [],
          goals: [],
        },
        today,
      );
      result = this.get(todo.id);
    } else {
      const todo = this.get(input.id!);
      if (todo.revision !== input.expectedRevision) throw new Error("This todo changed. Read it again before editing.");
      switch (name) {
        case "update_todo":
          this.vault.updateTodo(todo.id, { task: input.task, priority: input.priority, notes: input.notes }, today);
          break;
        case "set_todo_status":
          this.vault.updateTodo(todo.id, { status: input.status, completedOn: input.completedOn }, today);
          break;
        case "add_subtask":
          this.vault.addSubtask(todo.id, input.text!);
          break;
        case "set_subtask_done": {
          const subtask = allSubtasks(todo.subtasks).find((s) => s.id === input.subtaskId);
          if (!subtask) throw new Error("Subtask not found in this todo.");
          this.vault.setSubtaskDone(subtask.id, input.done!);
          break;
        }
        case "delete_todo":
          this.vault.deleteTodo(todo.id);
          break;
        default:
          throw new Error("Unknown task operation.");
      }
      result = name === "delete_todo" ? { deleted: todo.id } : this.get(todo.id);
    }
    // Bounded retry protection for this running process. Re-read after a restart.
    if (this.requests.size >= 1024) this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(input.requestId, { fingerprint, result });
    return result;
  }
}
