import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const bridge = readFileSync(new URL("../../../../services/union-wuzapi-bridge/server.mjs", import.meta.url), "utf8");

test("WuzAPI sends an ordinary playable MP3 attachment, never a PTT voice note", () => {
  assert.match(bridge, /const toPlayableAudio = async input =>/);
  assert.match(bridge, /"-c:a","libmp3lame","-b:a","96k"/);
  assert.match(bridge, /const seconds=inspectMp3\(bytes\)/);
  assert.match(bridge, /outgoingMime=audio\?"audio\/mpeg":mime/);
  assert.match(bridge, /MimeType:"audio\/mpeg",PTT:false,Seconds:audio\.seconds/);
  assert.doesNotMatch(bridge, /PTT:true|audio\/ogg; codecs=opus/);
  assert.match(bridge, /media_too_large/);
  assert.match(bridge, /audio_conversion_failed/);
});

test("FFmpeg can encode a valid MP3 audio attachment from a browser-like recording", t => {
  const version = spawnSync("ffmpeg", ["-version"], { encoding:"utf8", timeout:5000 });
  if(version.error || version.status !== 0) return t.skip("FFmpeg unavailable on this runner");

  const input = spawnSync("ffmpeg", [
    "-hide_banner","-loglevel","error","-f","lavfi",
    "-i","sine=frequency=440:duration=1.5",
    "-ac","1","-c:a","libopus","-f","webm","pipe:1",
  ], { timeout:15000, maxBuffer:2_000_000 });
  if(input.status !== 0 || !input.stdout?.length) return t.skip("FFmpeg runner lacks WebM/Opus");

  const result = spawnSync("ffmpeg", [
    "-hide_banner","-loglevel","error","-nostdin","-i","pipe:0",
    "-map","0:a:0","-vn","-ac","1","-ar","44100",
    "-c:a","libmp3lame","-b:a","96k",
    "-id3v2_version","0","-write_xing","0","-f","mp3","pipe:1",
  ], { input:input.stdout, timeout:15000, maxBuffer:2_000_000 });
  if(result.status !== 0 || !result.stdout?.length) {
    assert.fail("MP3 conversion failed; verify FFmpeg has libmp3lame installed");
  }
  assert.equal(result.stdout[0],0xff,"MPEG audio frame sync starts the output");
  assert.equal(result.stdout[1] & 0xfe,0xfa,"Output contains MPEG1 Layer III frames");

  const probe=spawnSync("ffprobe",[
    "-v","error","-show_entries","stream=codec_name",
    "-of","default=noprint_wrappers=1:nokey=1","pipe:0",
  ],{input:result.stdout,timeout:8000,encoding:"utf8"});
  if(!probe.error) {
    assert.equal(probe.status,0);
    assert.match(probe.stdout,/mp3/);
  }
});
