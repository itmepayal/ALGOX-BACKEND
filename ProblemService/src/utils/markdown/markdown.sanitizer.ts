import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import TurndownService from "turndown";
import logger from "../../config/logger.config";

export async function sanitizeMarkdown(markdown: string): Promise<string> {
  if (!markdown || typeof markdown != "string") {
    return "";
  }
  try {
    const convertedHtml = await marked.parse(markdown);
    const cleanHtml = sanitizeHtml(convertedHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "img",
        "pre",
        "code",
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ["src", "alt", "title", "width", "height"],
        code: ["class"],
        pre: ["class"],
        a: ["href", "target"],
      },
      allowedSchemes: ["http", "https"],
      allowedSchemesByTag: {
        img: ["http", "https"],
      },
    });
    const tds = new TurndownService();
    return tds.turndown(cleanHtml);
  } catch (error) {
    logger.error("Error sanitizing markdown", error);
    return "";
  }
}
