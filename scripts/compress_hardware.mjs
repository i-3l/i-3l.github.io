// Lossless EXT_meshopt_compression. Run after export_hardware.py with Node >= 18.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptEncoder } from './vendor/meshopt_encoder.module.mjs';

await MeshoptEncoder.ready;
for (const model of ['r1pro', 'franka']) {
  const path = new URL(`../static/models/joylo-${model}.glb`, import.meta.url);
  const input = await readFile(path);
  const jsonLength = input.readUInt32LE(12);
  const gltf = JSON.parse(input.subarray(20, 20 + jsonLength));
  const binary = input.subarray(28 + jsonLength);
  // Already compressed assets need no further processing.
  if (gltf.extensionsRequired?.includes('EXT_meshopt_compression')) continue;
  const chunks = [];
  let offset = 0;
  for (const [index, view] of gltf.bufferViews.entries()) {
    const accessor = gltf.accessors.find(item => item.bufferView === index);
    const stride = view.byteLength / accessor.count;
    const mode = view.target === 34963 ? 'TRIANGLES' : 'ATTRIBUTES';
    const source = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    const compressed = MeshoptEncoder.encodeGltfBuffer(source, accessor.count, stride, mode);
    view.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: offset,
      byteLength: compressed.length, byteStride: stride, count: accessor.count, mode } };
    // A placeholder fallback buffer is valid when meshopt is required.
    view.buffer = 1;
    chunks.push(Buffer.from(compressed), Buffer.alloc((4 - compressed.length % 4) % 4));
    offset += compressed.length + (4 - compressed.length % 4) % 4;
  }
  gltf.buffers = [{ byteLength: offset }, { byteLength: binary.length,
    extensions: { EXT_meshopt_compression: { fallback: true } } }];
  gltf.extensionsUsed = [...(gltf.extensionsUsed || []), 'EXT_meshopt_compression'];
  gltf.extensionsRequired = [...(gltf.extensionsRequired || []), 'EXT_meshopt_compression'];
  const json = Buffer.from(JSON.stringify(gltf));
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + offset, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(offset, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const output = Buffer.concat([header, paddedJson, binHeader, ...chunks]);
  await writeFile(path, output);
  const manifestPath = new URL('../static/models/sources.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest[model].output_sha256 = createHash('sha256').update(output).digest('hex');
  manifest[model].bytes = output.length;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${model}: ${input.length.toLocaleString()} → ${(28 + paddedJson.length + offset).toLocaleString()} bytes`);
}
