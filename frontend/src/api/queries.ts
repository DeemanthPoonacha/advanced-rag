import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RAGStatus, PipelineConfig, UploadLog } from "../types";
import { useStore } from "../store/useStore";

const API_BASE = "http://localhost:8000";

// --- API Calls ---

export async function fetchStatus(): Promise<RAGStatus> {
  const res = await fetch(`${API_BASE}/api/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export async function fetchDocuments(): Promise<UploadLog[]> {
  const res = await fetch(`${API_BASE}/api/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  const data = await res.json();
  if (data.status === "success" && data.documents) {
    return data.documents.map((d: any) => ({
      filename: d.name,
      chunks_count: d.chunksCount,
      date: d.uploadTime,
      summarized_count: d.summarizedCount || 0,
      needs_summary_count: d.needsSummaryCount || 0,
    }));
  }
  return [];
}

export async function fetchConfig(): Promise<{ raw_yaml: string; resolved_config: PipelineConfig }> {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

export async function fetchIngestStatus(): Promise<Record<string, any>> {
  const res = await fetch(`${API_BASE}/api/ingest/status`);
  if (!res.ok) throw new Error("Failed to fetch ingest status");
  return res.json();
}

// --- Query Hooks ---

export function useRagStatus() {
  return useQuery<RAGStatus>({
    queryKey: ["ragStatus"],
    queryFn: fetchStatus,
  });
}

export function useDocuments() {
  const isUploading = useStore((s) => s.isUploading);

  return useQuery<UploadLog[]>({
    queryKey: ["documents"],
    queryFn: fetchDocuments,
    refetchInterval: (query) => {
      const documents = query.state.data;
      if (!documents) return false;
      const hasPending = documents.some(
        (log) => (log.needs_summary_count || 0) > (log.summarized_count || 0)
      );
      return hasPending && !isUploading ? 5000 : false;
    },
  });
}

export function usePipelineConfig() {
  return useQuery<{ raw_yaml: string; resolved_config: PipelineConfig }>({
    queryKey: ["pipelineConfig"],
    queryFn: fetchConfig,
  });
}

export function useIngestStatus() {
  const isUploading = useStore((s) => s.isUploading);
  const setRealIngestStatus = useStore((s) => s.setRealIngestStatus);
  const setActiveStep = useStore((s) => s.setActiveStep);
  const setMaxStepReached = useStore((s) => s.setMaxStepReached);
  const setIsUploading = useStore((s) => s.setIsUploading);
  const queryClient = useQueryClient();

  return useQuery<Record<string, any>>({
    queryKey: ["ingestStatus"],
    queryFn: fetchIngestStatus,
    enabled: isUploading,
    refetchInterval: isUploading ? 800 : false,
    onSuccess: (data) => {
      if (!data) return;
      setRealIngestStatus(data);
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const isAnyRunning = keys.some((filename) => {
          const info = data[filename];
          return info && info.status !== "completed" && info.status !== "failed";
        });

        // Determine active step
        let minStep = 3;
        keys.forEach((filename) => {
          const info = data[filename];
          if (info && typeof info.step === "number") {
            minStep = Math.min(minStep, info.step);
          } else if (info) {
            if (info.status === "uploading") {
              minStep = Math.min(minStep, 1);
            } else if (info.status === "partitioning") {
              minStep = Math.min(minStep, 2);
            } else if (info.status === "chunking" || info.status === "indexing") {
              minStep = Math.min(minStep, 3);
            }
          }
        });

        setActiveStep((prev) => Math.max(prev, minStep));
        setMaxStepReached((prev) => Math.max(prev, minStep));

        if (!isAnyRunning) {
          setIsUploading(false);
          useStore.getState().showToast("Document ingestion completed!", "success");
          queryClient.invalidateQueries(["documents"]);
          queryClient.invalidateQueries(["ragStatus"]);
        }
      }
    },
  });
}

// --- Mutation Hooks ---

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  const showToast = useStore((s) => s.showToast);

  return useMutation({
    mutationFn: async ({
      editMode,
      rawYaml,
      configData,
    }: {
      editMode: "visual" | "yaml";
      rawYaml: string;
      configData: PipelineConfig | null;
    }) => {
      let res;
      if (editMode === "yaml") {
        res = await fetch(`${API_BASE}/api/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: rawYaml }),
        });
      } else {
        res = await fetch(`${API_BASE}/api/config/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configData),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        let errMsg = typeof detail === "string" ? detail : detail.message || "Validation failed";
        if (detail && detail.errors) {
          errMsg += ": " + detail.errors.map((err: any) => `${err.loc.join(".")}: ${err.msg}`).join(", ");
        }
        throw new Error(errMsg);
      }
      return data;
    },
    onSuccess: () => {
      showToast("Configuration applied and pipeline reloaded!", "success");
      queryClient.invalidateQueries(["pipelineConfig"]);
      queryClient.invalidateQueries(["ragStatus"]);
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to update configuration", "error");
    },
  });
}

export function useUploadDocuments() {
  const queryClient = useQueryClient();
  const showToast = useStore((s) => s.showToast);
  const setIsUploading = useStore((s) => s.setIsUploading);
  const setWizardActive = useStore((s) => s.setWizardActive);
  const setWizardMinimized = useStore((s) => s.setWizardMinimized);
  const setActiveStep = useStore((s) => s.setActiveStep);
  const setMaxStepReached = useStore((s) => s.setMaxStepReached);
  const setAbortController = useStore((s) => s.setAbortController);

  return useMutation({
    mutationFn: async ({ files }: { files: File[] }) => {
      setIsUploading(true);
      setWizardActive(true);
      setWizardMinimized(false);
      setActiveStep(1);
      setMaxStepReached(1);
      showToast(`Uploading ${files.length} document(s)...`, "success");

      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      const controller = new AbortController();
      setAbortController(controller);

      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Ingestion failed");
      }
      return data;
    },
    onSuccess: (data) => {
      showToast(`Ingested successfully! Created ${data.total_chunks_ingested} chunks.`, "success");
      queryClient.invalidateQueries(["documents"]);
      queryClient.invalidateQueries(["ragStatus"]);
    },
    onError: (err: any) => {
      if (err.name === "AbortError") return;
      showToast(err.message || "Upload failed due to connection error", "error");
      setWizardActive(false);
    },
    onSettled: () => {
      setAbortController(null);
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const showToast = useStore((s) => s.showToast);

  return useMutation({
    mutationFn: async ({ filename }: { filename: string }) => {
      const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Delete failed");
      }
      return data;
    },
    onSuccess: (data) => {
      showToast(data.message || `Deleted successfully!`, "success");
      queryClient.invalidateQueries(["documents"]);
      queryClient.invalidateQueries(["ragStatus"]);
    },
    onError: (err: any) => {
      showToast(err.message || "Delete failed due to connection error", "error");
    },
  });
}
