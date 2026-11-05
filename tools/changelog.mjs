/**
 * 修改记录.md 里某一版的那一节：GitHub Release 说明（tools/package.mjs）和工具箱里的更新内容弹窗（app/whats-new.json）共用。
 * 写法：精简、说玩家得到了什么，最后一条是「修复已知 bug」。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const CHANGELOG_FILE = join(ROOT, "修改记录.md");

const heading = (version) => new RegExp(`^## ${version.replaceAll(".", "\\.")}（([^）]*)）`, "m");

/** 「## <版本>（日期）」下面那一节的正文（不含标题），相对链接只留文字。找不到就报错。 */
export function changelogSection(text, version) {
  const changelog = text.replaceAll("\r\n", "\n");
  const start = changelog.search(heading(version));
  if (start < 0) throw new Error(`修改记录.md 里没有「## ${version}（日期）」这一节，先写更新内容再打包`);
  const rest = changelog.slice(start).split("\n");
  const end = rest.findIndex((line, index) => index > 0 && line.startsWith("## "));
  return rest.slice(1, end < 0 ? undefined : end).join("\n").trim().replace(/\[([^\]]+)\]\((?!https?:\/\/)[^)]+\)/g, "$1");
}

/**
 * 更新内容弹窗用的数据。弹窗也在 B站 Toy 包里，Toy 包不能出现 GitHub 和镜像地址：提到它们的条目跳过
 * （以后的修改记录按 Skill 本来就不写这些）。链接只留文字。
 */
export function whatsNew(version, text = readFileSync(CHANGELOG_FILE, "utf-8")) {
  const date = text.replaceAll("\r\n", "\n").match(heading(version))?.[1] ?? "";
  const markdown = changelogSection(text, version)
    .split("\n")
    .filter((line) => !/github|jsdelivr|ghfast|gh-proxy/i.test(line))
    .join("\n")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
  return { version, date, markdown };
}
