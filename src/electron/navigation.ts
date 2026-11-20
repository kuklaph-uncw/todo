import { isWebUrl } from "../../public/rich-text.js";
import { isAppUrl } from "./protocol";

/** New-window requests from app pages may open only validated web URLs in the system browser. */
export function externalNavigationUrl(source: string, destination: string): string | null {
  return isAppUrl(source) && isWebUrl(destination) ? destination : null;
}
