"use client";

import { useEffect, useState } from "react";
import { ipfsToHttp } from "@/lib/ipfs";

export type DossierFile = { name: string; uri: string; url: string };

/** Fetch the file list for a loan dossier IPFS directory. */
export function useDossierFiles(dossierURI?: string) {
  const [files, setFiles] = useState<DossierFile[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dossierURI) {
      setFiles(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/ipfs/list?uri=${encodeURIComponent(dossierURI)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { files: DossierFile[] }) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dossierURI]);

  const fallbackUrl = dossierURI ? ipfsToHttp(dossierURI) : null;
  return { files, loading, fallbackUrl };
}
