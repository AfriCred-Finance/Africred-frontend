/** Convert ipfs://CID or ipfs://CID/path to an HTTP gateway URL. */
export function ipfsToHttp(uri: string, gateway = "https://ipfs.io/ipfs") {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) return `${gateway}/${uri.slice(7)}`;
  return uri;
}

/** Extract the root CID from an ipfs:// URI (strips any sub-path). */
export function ipfsCid(uri: string): string | null {
  if (!uri.startsWith("ipfs://")) return null;
  const rest = uri.slice(7);
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}
