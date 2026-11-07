/** exe 自动更新（1.3）的签名和版本清单。
 *
 *   node tools/update_sign.mjs keygen <文件夹>   # 生成一对密钥：私钥（发版签名用）和公钥（写进 desktop/src/update.rs 的 UPDATE_PUBLIC_KEY）
 *   node tools/update_sign.mjs release           # 发版时用：给打好的 exe 签名，写出 dist/ 里的 -update.exe 和 latest.json
 *
 * release 从环境变量 UPDATE_SIGNING_KEY 读私钥（CI 里来自仓库 Secret，本机测试时自己设）。
 * 签名格式和 minisign 一样（Ed25519，先对文件做 BLAKE2b-512 再签，带「可信注释」），可以用 minisign -V 核对；
 * 不用下载 minisign 工具，Node 自带的加密库就够。exe 里用 minisign-verify 校验。
 * 可信注释写版本号和文件名，和签名一起被签住：镜像改不了「这个文件是哪一版」。
 * 私钥只是一行 base64（8 字节密钥编号 + 32 字节种子），可以直接粘到 Secret 里。
 * 输出只用 GBK 编得出的字符（[OK]/[X]），中文 Windows 控制台默认 GBK。
 */
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign as edSign } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { whatsNew } from "./changelog.mjs";
import { packagePath, version } from "./package.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const MANIFEST_NAME = "latest.json";
const UPDATE_RS = join(ROOT, "desktop", "src", "update.rs");
const EXE = join(ROOT, "desktop", "target", "release", "FeifeiFoxToolbox.exe");
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

function parseSecret(secret) {
  const raw = Buffer.from(String(secret || "").trim(), "base64");
  if (raw.length !== 40) throw new Error("签名私钥不对：应该是 keygen 生成的那一行 base64（40 字节）");
  return { keyId: raw.subarray(0, 8), seed: raw.subarray(8) };
}

const privateKeyOf = (seed) => createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
const rawPublicKey = (privateKey) => Buffer.from(createPublicKey(privateKey).export({ format: "jwk" }).x, "base64url");

/** 私钥 → minisign 格式的公钥（base64，"Ed" + 密钥编号 + 32 字节公钥）。 */
export function publicKeyOf(secret) {
  const { keyId, seed } = parseSecret(secret);
  return Buffer.concat([Buffer.from("Ed"), keyId, rawPublicKey(privateKeyOf(seed))]).toString("base64");
}

export function generateKeyPair() {
  const secret = Buffer.concat([randomBytes(8), randomBytes(32)]).toString("base64");
  return { secret, publicKey: publicKeyOf(secret) };
}

/** minisign 格式的签名文字（四行）。trustedComment 不能换行。 */
export function signBytes(bytes, secret, trustedComment) {
  if (/[\r\n]/.test(trustedComment)) throw new Error("可信注释不能换行");
  const { keyId, seed } = parseSecret(secret);
  const key = privateKeyOf(seed);
  const digest = createHash("blake2b512").update(bytes).digest();
  const signature = edSign(null, digest, key);
  const global = edSign(null, Buffer.concat([signature, Buffer.from(trustedComment, "utf-8")]), key);
  return [
    `untrusted comment: feifeifox-toolbox update signature ${keyId.toString("hex").toUpperCase()}`,
    Buffer.concat([Buffer.from("ED"), keyId, signature]).toString("base64"),
    `trusted comment: ${trustedComment}`,
    global.toString("base64"),
    "",
  ].join("\n");
}

/** 写进 exe 的公钥（update.rs 里的 UPDATE_PUBLIC_KEY）。 */
export function embeddedPublicKey(text = readFileSync(UPDATE_RS, "utf-8")) {
  const key = text.match(/const UPDATE_PUBLIC_KEY: &str = "([^"]+)";/)?.[1];
  if (!key) throw new Error("desktop/src/update.rs 里找不到 UPDATE_PUBLIC_KEY");
  return key;
}

/** 版本清单：exe 读它判断有没有新版、下载哪个文件、签名对不对。 */
export function buildManifest({ version: v, date, notes, file, size, signature }) {
  return { version: v, date: date || "", notes: notes || "", file, size, signature };
}

export function release({ secret = process.env.UPDATE_SIGNING_KEY, exe = EXE } = {}) {
  if (!secret) throw new Error("没有签名私钥：设置环境变量 UPDATE_SIGNING_KEY（CI 里来自仓库 Secret）");
  if (publicKeyOf(secret) !== embeddedPublicKey()) throw new Error("签名私钥和 exe 里的公钥（update.rs 的 UPDATE_PUBLIC_KEY）不是一对，用这把私钥签的更新 exe 会拒收");
  if (!existsSync(exe)) throw new Error(`找不到编译出的 exe：${exe}（先 node tools/package.mjs --portable）`);
  const v = version();
  const target = packagePath("update", v);
  const file = target.split(/[\\/]/).pop();
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(exe, target);
  const bytes = readFileSync(target);
  const signature = signBytes(bytes, secret, `version:${v}\tfile:${file}`);
  const { date, markdown } = whatsNew(v);
  const manifest = buildManifest({ version: v, date, notes: markdown, file, size: statSync(target).size, signature });
  const out = join(dirname(target), MANIFEST_NAME);
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  console.log(`[OK] 已签名 ${file}（${(manifest.size / 1048576).toFixed(1)} MB），写出 ${MANIFEST_NAME}`);
  return { target, manifest: out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  try {
    if (command === "keygen") {
      if (!arg) throw new Error("用法：node tools/update_sign.mjs keygen <放私钥的文件夹>");
      const dir = resolve(arg);
      const secretFile = join(dir, "update-signing.key");
      if (existsSync(secretFile)) throw new Error(`${secretFile} 已经存在，不覆盖（换密钥要同时换 exe 里的公钥）`);
      mkdirSync(dir, { recursive: true });
      const { secret, publicKey } = generateKeyPair();
      writeFileSync(secretFile, `${secret}\n`, "utf-8");
      writeFileSync(join(dir, "update-signing.pub"), `${publicKey}\n`, "utf-8");
      console.log(`[OK] 私钥：${secretFile}（不要提交，加到仓库 Secret UPDATE_SIGNING_KEY）`);
      console.log(`[OK] 公钥：${publicKey}（写进 desktop/src/update.rs 的 UPDATE_PUBLIC_KEY）`);
    } else if (command === "release") {
      release();
    } else {
      throw new Error("用法：node tools/update_sign.mjs keygen <文件夹> | release");
    }
  } catch (error) {
    console.error(`[X] ${error.message}`);
    process.exit(1);
  }
}
