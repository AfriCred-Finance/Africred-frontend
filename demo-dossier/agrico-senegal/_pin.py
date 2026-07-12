"""Pin the AgriCo dossier PDFs to IPFS via Pinata. Returns the wrapping CID.

Reads PINATA_JWT from af-frontend/.env.local. Mirrors the /api/ipfs route's
filename convention (files appended under a 'dossier/' prefix so wrapWithDirectory
preserves their original names).
"""
import json
import os
import sys
from pathlib import Path
import urllib.request
import mimetypes
import secrets

HERE = Path(__file__).parent
ENV_FILE = HERE.parent.parent / ".env.local"

def load_env():
    env = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = load_env()
jwt = env.get("PINATA_JWT")
if not jwt:
    print("PINATA_JWT not found in .env.local", file=sys.stderr)
    sys.exit(1)

pdfs = sorted(HERE.glob("*.pdf"))
if not pdfs:
    print("No PDFs found.", file=sys.stderr)
    sys.exit(1)

boundary = "----africred" + secrets.token_hex(16)
body = bytearray()

def add_part(filename: str, data: bytes, ctype: str):
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.extend(f"Content-Type: {ctype}\r\n\r\n".encode())
    body.extend(data)
    body.extend(b"\r\n")

def add_field(name: str, value: str):
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
    body.extend(value.encode())
    body.extend(b"\r\n")

for pdf in pdfs:
    add_part(f"dossier/{pdf.name}", pdf.read_bytes(), "application/pdf")

add_field("pinataOptions", json.dumps({"wrapWithDirectory": True}))
add_field("pinataMetadata", json.dumps({"name": "africred-dossier-agrico-senegal"}))

body.extend(f"--{boundary}--\r\n".encode())

req = urllib.request.Request(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    data=bytes(body),
    headers={
        "Authorization": f"Bearer {jwt}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    },
)
print(f"Pinning {len(pdfs)} file(s) to Pinata...")
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
except urllib.error.HTTPError as e:
    print(f"Pinata error: {e.code} {e.reason}", file=sys.stderr)
    print(e.read().decode(errors="replace"), file=sys.stderr)
    sys.exit(2)

cid = data.get("IpfsHash")
print(f"\nPinned. CID:        {cid}")
print(f"          ipfs URI:  ipfs://{cid}")
print(f"          gateway:   https://ipfs.io/ipfs/{cid}/")
print("\nFiles available at:")
for pdf in pdfs:
    print(f"  https://ipfs.io/ipfs/{cid}/dossier/{pdf.name}")
