import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "tools.js"), "utf8");

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
  return source.slice(start, end);
}

function run(code, exports) {
  const context = vm.createContext({
    Blob,
    DataView,
    Map,
    Math,
    Number,
    TextDecoder,
    TextEncoder,
    URL,
    Uint8Array,
    Uint16Array,
    Uint32Array,
  });
  vm.runInContext(`${code}\nglobalThis.__exports = { ${exports.join(", ")} };`, context);
  return context.__exports;
}

const csv = run(
  section("function parseCsv", "function md5Bytes"),
  ["parseCsv", "csvString", "validateCsvTable"],
);
const originalCsv = 'name,note\r\nAlice,"line 1\nline 2"\r\nBob,"x,y"';
const rows = csv.parseCsv(originalCsv);
assert.equal(rows.length, 3);
assert.equal(rows[1][1], "line 1\nline 2");
assert.equal(rows[2][1], "x,y");
assert.deepEqual(JSON.parse(JSON.stringify(csv.parseCsv(csv.csvString(rows)))), JSON.parse(JSON.stringify(rows)));
assert.throws(() => csv.validateCsvTable([["a", "b"], ["only one"]], "broken.csv"), /列数/);

const md5 = run(section("function md5Bytes", "async function digestFile"), ["md5Bytes"]);
assert.equal(md5.md5Bytes(new TextEncoder().encode("abc")), "900150983cd24fb0d6963f7d28e17f72");

const colors = run(section("function colorRgb", "async function imageCanvas"), ["parseColorValue", "rgbToHex", "rgbToHsl"]);
assert.equal(colors.rgbToHex(...colors.parseColorValue("rgb(36, 109, 168)")), "#246da8");
assert.equal(colors.rgbToHex(...colors.parseColorValue("hsl(204, 65%, 40%)")), "#2473a8");
assert.throws(() => colors.parseColorValue("not-a-color"), /HEX/);

const opencc = run(section("function fallbackChineseMaps", "function runTextOperation"), ["parseOpenCcCharacterDictionary"]);
const stMap = opencc.parseOpenCcCharacterDictionary(fs.readFileSync(path.join(root, "vendor", "opencc-st-characters.txt"), "utf8"));
const tsMap = opencc.parseOpenCcCharacterDictionary(fs.readFileSync(path.join(root, "vendor", "opencc-ts-characters.txt"), "utf8"));
assert.ok(stMap.size > 3000);
assert.ok(tsMap.size > 3000);
assert.equal(stMap.get("忧"), "憂");
assert.equal(tsMap.get("憂"), "忧");

const jpeg = run(
  `${section("function joinBytes", "const CRC_TABLE")}${section("function readExifField", "function imageFields")}`,
  ["stripJpegMetadata", "exifSummary"],
);
const syntheticJpeg = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x06, 0x58, 0x4d, 0x50, 0x00,
  0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb,
  0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
]);
const stripped = jpeg.stripJpegMetadata(syntheticJpeg);
assert.ok(stripped.length < syntheticJpeg.length);
assert.deepEqual([...stripped.slice(0, 8)], [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb]);
assert.match(jpeg.exifSummary(stripped), /APP1 区块：0/);

const qr = run(
  section("function escapeWifiValue", "function temporaryQrContent"),
  ["buildWifiPayload", "buildVcardPayload"],
);
assert.equal(
  qr.buildWifiPayload({ name: ' WYJ;Lab:5G\\" ', security: "WPA", password: "safe;pass", hidden: true }),
  'WIFI:T:WPA;S: WYJ\\;Lab\\:5G\\\\\\" ;P:safe\\;pass;H:true;;',
);
assert.equal(qr.buildWifiPayload({ name: "Guest WiFi", security: "nopass", password: "ignored" }), "WIFI:T:nopass;S:Guest WiFi;P:;H:false;;");
assert.throws(() => qr.buildWifiPayload({ name: "x", security: "WPA", password: "short" }), /8/);
assert.throws(() => qr.buildWifiPayload({ name: "x", security: "WEP", password: "bad" }), /WEP/);
const vcard = qr.buildVcardPayload({
  family: "王", given: "小明", phone: "+86 13800000000", email: "wyj@example.com",
  organization: "WYJ, Lab", title: "开发;测试", street: "一号路", city: "上海",
  region: "上海", postal: "200000", country: "中国", website: "https://thewyj.uk/contact",
  note: "第一行\n第二行",
});
assert.match(vcard, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
assert.match(vcard, /N:王;小明;;;/);
assert.match(vcard, /ORG:WYJ\\, Lab/);
assert.match(vcard, /TITLE:开发\\;测试/);
assert.match(vcard, /ADR;TYPE=HOME:;;一号路;上海;上海;200000;中国/);
assert.match(vcard, /NOTE:第一行\\n第二行/);
assert.throws(() => qr.buildVcardPayload({ email: "broken" }), /邮箱/);
assert.throws(() => qr.buildVcardPayload({ website: "javascript:alert(1)" }), /http/);

console.log("tools.js self-checks: 27 passed");
