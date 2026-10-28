"""Minimal Electron asar reader: list or extract members without dependencies.

Usage:
  python asar_extract.py list   <archive> [substr]
  python asar_extract.py cat    <archive> <member-path>
  python asar_extract.py get    <archive> <member-path> <out-file>
"""
import json
import os
import struct
import sys

HEADER_SIZE = 16


def read_header(fh):
    fh.seek(0)
    head = fh.read(16)
    if len(head) != 16:
        raise SystemExit("not an asar archive")
    # pickle: 4-byte uint32 payload size, then pickle opcode 'B' style protocol 2
    (size1,) = struct.unpack_from("<I", head, 0)
    (size2,) = struct.unpack_from("<I", head, 4)
    (size3,) = struct.unpack_from("<I", head, 8)
    (json_len,) = struct.unpack_from("<I", head, 12)
    if size1 != 4:
        raise SystemExit("unexpected pickle layout")
    json_size = size2
    if size3 != json_size + 4:
        # size3 covers the json string pickle payload
        pass
    fh.seek(HEADER_SIZE)
    raw = fh.read(json_size)
    decoder = json.JSONDecoder()
    obj, end = decoder.raw_decode(raw.decode("utf-8"))
    # File blobs begin 8 bytes before the end of the pickled JSON payload.
    return obj, json_size - 8


def walk(node, prefix=""):
    for name, entry in node.get("files", {}).items():
        path = prefix + "/" + name
        if "files" in entry:
            yield from walk(entry, path)
        else:
            yield path, entry


def member(files, want):
    node = files
    parts = [p for p in want.replace("\\", "/").split("/") if p]
    for part in parts:
        node = node["files"][part]
    return node


def main():
    cmd = sys.argv[1]
    archive = sys.argv[2]
    with open(archive, "rb") as fh:
        header, header_len = read_header(fh)
        if cmd == "list":
            needle = sys.argv[3] if len(sys.argv) > 3 else ""
            for path, entry in walk(header):
                if needle in path:
                    print(path, entry.get("size"))
            return
        want = sys.argv[3]
        entry = member(header, want)
        offset = int(entry["offset"])
        size = int(entry["size"])
        base = HEADER_SIZE + header_len
        fh.seek(base + offset)
        blob = fh.read(size)
        if cmd == "cat":
            sys.stdout.write(blob.decode("utf-8", "replace"))
        elif cmd == "get":
            out = sys.argv[4]
            os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
            with open(out, "wb") as out_fh:
                out_fh.write(blob)
            print("wrote", out, len(blob))
        else:
            raise SystemExit("unknown command")


if __name__ == "__main__":
    main()
