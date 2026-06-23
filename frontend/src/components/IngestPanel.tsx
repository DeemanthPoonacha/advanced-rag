import React, { useState, useEffect, useMemo } from "react";
import { RAGStatus, UploadLog } from "../types";
import { FileRegistryList } from "./ingest/FileRegistryList";
import { ChunkInspector } from "./ingest/ChunkInspector";
import { FileMetricsInspector } from "./ingest/FileMetricsInspector";
import { IngestOverview } from "./ingest/IngestOverview";
import { PipelineVisualizer } from "./ingest/PipelineVisualizer";

interface IngestPanelProps {
  status: RAGStatus | null;
  isUploading: boolean;
  uploadLogs: UploadLog[];
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCancelUpload: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDeleteFile: (filename: string) => Promise<void>;
}

interface ChunkData {
  id: string;
  page: number;
  type: "text" | "image" | "table";
  snippet: string;
  originalText: string;
  summaryText: string;
  isRaw: boolean;
  metadata: Record<string, any>;
}

interface ProcessingFile {
  id: string;
  name: string;
  size: string;
  status: "completed" | "processing" | "failed";
  textCount: number;
  tableCount: number;
  imageCount: number;
  titleCount: number;
  otherCount: number;
  totalElements: number;
  totalChunks: number;
  summarizedChunks: number;
  chunks: ChunkData[];
}

export function IngestPanel({
  status,
  isUploading,
  uploadLogs,
  handleFileUpload,
  handleCancelUpload,
  fileInputRef,
  handleDeleteFile,
}: IngestPanelProps) {
  const [wizardActive, setWizardActive] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [maxStepReached, setMaxStepReached] = useState<number>(1);
  const [selectedChunk, setSelectedChunk] = useState<ChunkData | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"original" | "summary" | "metadata">("original");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Accordion toggles state mapping
  const [openPartitionFiles, setOpenPartitionFiles] = useState<Record<string, boolean>>({});
  const [openChunkFiles, setOpenChunkFiles] = useState<Record<string, boolean>>({});
  const [openRegistryFiles, setOpenRegistryFiles] = useState<Record<string, boolean>>({});

  const togglePartitionAccordion = (fileId: string) => {
    setOpenPartitionFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const toggleChunkAccordion = (fileId: string) => {
    setOpenChunkFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const toggleRegistryAccordion = (fileId: string) => {
    setOpenRegistryFiles(prev => {
      const isExpanded = !prev[fileId];
      if (isExpanded) {
        setSelectedFileId(fileId);
        setSelectedChunk(null);
      } else if (selectedFileId === fileId) {
        setSelectedFileId(null);
      }
      const newState: Record<string, boolean> = {};
      newState[fileId] = isExpanded;
      return newState;
    });
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [apiChunks, setApiChunks] = useState<any[]>([]);

  // Simulation files
  const [files, setFiles] = useState<ProcessingFile[]>([
    {
      id: "f1",
      name: "attention-is-all-you-need.pdf",
      size: "2.1 MB",
      status: "completed",
      textCount: 166,
      tableCount: 4,
      imageCount: 7,
      titleCount: 30,
      otherCount: 13,
      totalElements: 220,
      totalChunks: 25,
      summarizedChunks: 8,
      chunks: [
        {
          id: "f1-c1",
          page: 1,
          type: "text",
          snippet: "Attention Is All You Need. Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones...",
          originalText: "Attention Is All You Need\n\nAshish Vaswani*, Noam Shazeer*, Niki Parmar*, Jakob Uszkoreit*, Llion Jones*, Aidan N. Gomez*†, Łukasz Kaiser*, Illia Polosukhin*‡\nGoogle Brain, Google Research\n\nAbstract\nThe dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
          summaryText: "",
          isRaw: true,
          metadata: {
            source: "data/temp_uploads/attention-is-all-you-need.pdf",
            file_name: "attention-is-all-you-need.pdf",
            file_type: "pdf",
            language: "en",
            page_number: 1,
            total_pages: 15
          }
        },
        {
          id: "f1-c2",
          page: 2,
          type: "image",
          snippet: "### Searchable Description for Document Content on Neural Sequence Transduction Models #### Question Variations...",
          originalText: "3 Model Architecture\nMost competitive neural sequence transduction models have an encoder-decoder structure [5, 2, 35]. Here, the encoder maps an input sequence of symbol representations (x1, ..., xn) to a sequence of continuous representations z = (z1, ..., zn). Given z, the decoder then generates an output sequence (y1, ..., ym) of symbols one element at a time. At each step the model is auto-regressive [10].",
          summaryText: "Searchable description of the core Transformer model architecture diagram. The diagram outlines the stacked encoder-decoder layout using multi-head attention and pointwise, fully connected layers. Visual components include input/output embeddings, positional encoding, multi-head attention blocks, and linear projection/softmax output.",
          isRaw: false,
          metadata: {
            source: "data/temp_uploads/attention-is-all-you-need.pdf",
            file_name: "attention-is-all-you-need.pdf",
            file_type: "pdf",
            language: "en",
            page_number: 2,
            total_pages: 15,
            image_extracted: true
          }
        },
        {
          id: "f1-c3",
          page: 2,
          type: "table",
          snippet: "Table 1: Maximum path lengths, sequential operations and minimum number of sequential operations...",
          originalText: "Table 1: Maximum path lengths, sequential operations and minimum number of sequential operations for different layer types. n is the sequence length, d is the representation dimension, k is the kernel size of convolutions and r the size of the neighborhood in local self-attention.\n\n| Layer Type | Complexity per Layer | Sequential Operations | Maximum Path Length |\n|---|---|---|---|\n| Self-Attention | O(n^2 * d) | O(1) | O(1) |\n| Recurrent | O(n * d^2) | O(n) | O(n) |\n| Convolutional | O(k * n * d^2) | O(1) | O(log_k(n)) |\n| Self-Attention (restricted) | O(r * n * d) | O(1) | O(n/r) |",
          summaryText: "Structured Markdown representation of Table 1 comparing computational complexity, sequential operations, and maximum path lengths across Self-Attention, Recurrent, and Convolutional layers. Details Self-Attention's O(1) sequential operation advantage.",
          isRaw: false,
          metadata: {
            source: "data/temp_uploads/attention-is-all-you-need.pdf",
            file_name: "attention-is-all-you-need.pdf",
            file_type: "pdf",
            language: "en",
            page_number: 2,
            total_pages: 15,
            table_extracted: true
          }
        }
      ]
    },
    {
      id: "f2",
      name: "quarterly_report.pdf",
      size: "1.4 MB",
      status: "completed",
      textCount: 110,
      tableCount: 8,
      imageCount: 3,
      titleCount: 15,
      otherCount: 8,
      totalElements: 144,
      totalChunks: 18,
      summarizedChunks: 11,
      chunks: [
        {
          id: "f2-c1",
          page: 1,
          type: "text",
          snippet: "Q3 Performance Review. Revenue grew by 14% year over year reaching record highs...",
          originalText: "Q3 Performance Review\n\nExecutive Summary:\nOur revenue for the third quarter of this fiscal year grew by 14% year over year, reaching an all-time record high. Operating margins improved by 230 basis points due to operational efficiency and overhead reduction.",
          summaryText: "",
          isRaw: true,
          metadata: {
            source: "data/temp_uploads/quarterly_report.pdf",
            file_name: "quarterly_report.pdf",
            file_type: "pdf",
            language: "en",
            page_number: 1,
            total_pages: 8
          }
        },
        {
          id: "f2-c2",
          page: 3,
          type: "table",
          snippet: "Table 2: Regional revenue breakdown. North America remains our biggest market...",
          originalText: "Table 2: Regional revenue breakdown by quarters (in Millions USD):\n\n| Region | Q1 | Q2 | Q3 |\n|---|---|---|---|\n| North America | 450 | 480 | 520 |\n| EMEA | 280 | 300 | 310 |\n| APAC | 150 | 180 | 210 |\n| LATAM | 80 | 90 | 95 |",
          summaryText: "Quarterly revenue table grouped by regions (North America, EMEA, APAC, LATAM) spanning Q1 to Q3. North America shows consistent growth and largest share (520M in Q3). LATAM has lowest share (95M in Q3).",
          isRaw: false,
          metadata: {
            source: "data/temp_uploads/quarterly_report.pdf",
            file_name: "quarterly_report.pdf",
            file_type: "pdf",
            language: "en",
            page_number: 3,
            total_pages: 8,
            table_extracted: true
          }
        }
      ]
    },
    {
      id: "f3",
      name: "read_me.txt",
      size: "12 KB",
      status: "completed",
      textCount: 12,
      tableCount: 0,
      imageCount: 0,
      titleCount: 0,
      otherCount: 0,
      totalElements: 12,
      totalChunks: 2,
      summarizedChunks: 0,
      chunks: [
        {
          id: "f3-c1",
          page: 1,
          type: "text",
          snippet: "This document contains basic instructions and release log info. Plain text file parsed directly...",
          originalText: "Advanced RAG Pipeline Release Log\n\nUsage:\n1. Run the local backend container using run_servers.sh\n2. Load config.yaml templates to initiate core databases\n3. Connect client frontend interface via API endpoints",
          summaryText: "",
          isRaw: true,
          metadata: {
            source: "data/temp_uploads/read_me.txt",
            file_name: "read_me.txt",
            file_type: "txt",
            language: "en",
            page_number: 1,
            total_pages: 1
          }
        }
      ]
    }
  ]);

  const fetchChunks = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/chunks?limit=10000");
      if (res.ok) {
        const data = await res.json();
        setApiChunks(data.chunks || []);
      }
    } catch (e) {
      console.error("Failed to fetch API chunks", e);
    }
  };

  useEffect(() => {
    fetchChunks();
  }, [uploadLogs, status]);

  const [ragSearchQuery, setRagSearchQuery] = useState("");
  const [isRagSearching, setIsRagSearching] = useState(false);
  const [ragSearchResults, setRagSearchResults] = useState<any | null>(null);
  const [ragSearchError, setRagSearchError] = useState<string | null>(null);

  const [realIngestStatus, setRealIngestStatus] = useState<Record<string, any>>({});

  useEffect(() => {
    let intervalId: any;
    if (isUploading) {
      const pollStatus = async () => {
        try {
          const res = await fetch("http://localhost:8000/api/ingest/status");
          if (res.ok) {
            const data = await res.json();
            setRealIngestStatus(data);
          }
        } catch (e) {
          console.error("Failed to fetch ingest status", e);
        }
      };
      
      pollStatus();
      intervalId = setInterval(pollStatus, 800);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isUploading]);

  // Unified files mapping and sorting/grouping
  const mockFilesList = files?.map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    status: file.status,
    uploadTime: file.name === "read_me.txt" ? "Jun 21, 2026, 04:20 PM" : "Jun 22, 2026, 10:30 AM",
    textCount: file.textCount,
    tableCount: file.tableCount,
    imageCount: file.imageCount,
    titleCount: file.titleCount,
    otherCount: file.otherCount,
    totalElements: file.totalElements,
    totalChunks: file.totalChunks,
    summarizedChunks: file.summarizedChunks,
    chunksCount: file.totalChunks,
    chunks: file.chunks,
    isMock: true,
  }));

  const uploadedFilesList = useMemo(() => {
    const allUniqueFilenames = Array.from(new Set([
      ...uploadLogs.map(l => l.filename),
      ...apiChunks.map(c => {
        const docName = c.metadata?.file_name || c.metadata?.source || "";
        return docName.split(/[/\\]/).pop() || "";
      }).filter(Boolean),
      ...Object.keys(realIngestStatus)
    ]));

    return allUniqueFilenames.map((filename, idx) => {
      const log = uploadLogs.find(l => l.filename.toLowerCase() === filename.toLowerCase());
      const activeInfo = realIngestStatus[filename];
      
      const statusValue = activeInfo
        ? (activeInfo.status === "completed" 
            ? ("completed" as const) 
            : activeInfo.status === "failed" 
            ? ("failed" as const) 
            : ("processing" as const))
        : ("completed" as const);

      const matchedChunks = apiChunks.filter((c) => {
        const docName = (c.metadata?.file_name || c.metadata?.source || "").toLowerCase();
        const cleanDoc = docName.split(/[/\\]/).pop() || "";
        return cleanDoc === filename.toLowerCase();
      });

      const formattedChunks = matchedChunks.map((c, cIdx) => ({
        id: c.id || `${filename}-chunk-${cIdx}`,
        page: c.metadata?.page_number || 1,
        type: (c.metadata?.file_type === "image" || c.metadata?.image_extracted)
          ? ("image" as const)
          : c.metadata?.table_extracted
          ? ("table" as const)
          : ("text" as const),
        snippet: c.content ? (c.content.length > 120 ? c.content.substring(0, 120) + "..." : c.content) : "",
        originalText: c.content || "",
        summaryText: c.metadata?.summary_text || "",
        isRaw: !c.metadata?.summary_text,
        metadata: c.metadata || {},
      }));

      const textCount = formattedChunks.length > 0
        ? formattedChunks.filter(c => c.type === "text").length
        : (activeInfo?.text_count || 0);

      const tableCount = formattedChunks.length > 0
        ? formattedChunks.filter(c => c.type === "table").length
        : (activeInfo?.table_count || 0);

      const imageCount = formattedChunks.length > 0
        ? formattedChunks.filter(c => c.type === "image").length
        : (activeInfo?.image_count || 0);

      const titleCount = formattedChunks.length > 0
        ? formattedChunks.filter(c => c.metadata?.title_extracted).length
        : (activeInfo?.title_count || 0);

      const otherCount = 0;
      
      const totalChunks = formattedChunks.length > 0
        ? formattedChunks.length
        : (activeInfo?.chunks_count || (log ? log.chunks_count : 0));

      const totalElements = formattedChunks.length > 0
        ? textCount + tableCount + imageCount
        : (activeInfo?.total_elements || totalChunks || 1);

      const summarizedChunks = formattedChunks.length > 0
        ? formattedChunks.filter(c => !c.isRaw).length
        : (activeInfo?.chunks ? activeInfo.chunks.filter((c: any) => !c.isRaw).length : 0);

      const finalChunks = formattedChunks.length > 0
        ? formattedChunks
        : (activeInfo?.chunks || []);

      return {
        id: log ? `uploaded-${uploadLogs.indexOf(log)}-${filename}` : `db-${idx}-${filename}`,
        name: filename,
        size: "N/A",
        status: statusValue,
        uploadTime: log ? log.date : "Database Ingested",
        textCount,
        tableCount,
        imageCount,
        titleCount,
        otherCount,
        totalElements,
        totalChunks,
        summarizedChunks,
        chunks: finalChunks,
        isMock: false,
      };
    });
  }, [uploadLogs, apiChunks, realIngestStatus]);

  const isMockMode = status?.mock_mode || false;
  const allFiles = isMockMode ? [...uploadedFilesList, ...mockFilesList] : uploadedFilesList;
  const selectedFile = allFiles.find(f => f.id === selectedFileId) || null;

  const getGroupKey = (uploadTime: string) => {
    const parts = uploadTime.split(",");
    if (parts.length >= 2) {
      if (/\d{4}/.test(parts[1])) {
        return `${parts[0].trim()}, ${parts[1].trim()}`;
      }
      return parts[0].trim();
    }
    return uploadTime;
  };

  const groupedFiles: Record<string, typeof allFiles> = {};
  allFiles.forEach((file) => {
    const groupKey = getGroupKey(file.uploadTime);
    if (!groupedFiles[groupKey]) {
      groupedFiles[groupKey] = [];
    }
    groupedFiles[groupKey].push(file);
  });

  const parseDate = (dStr: string) => {
    const parsed = Date.parse(dStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  const sortedGroupKeys = Object.keys(groupedFiles).sort((a, b) => {
    return parseDate(b) - parseDate(a);
  });

  const handleRagSearch = async () => {
    if (!ragSearchQuery.trim()) {
      clearRagSearch();
      return;
    }
    setIsRagSearching(true);
    setRagSearchError(null);

    try {
      const res = await fetch("http://localhost:8000/api/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragSearchQuery })
      });
      if (res.ok) {
        const data = await res.json();
        setRagSearchResults({
          sources: data.chunks || [],
          latency_ms: 15,
          trace_id: "api-retrieval-" + Math.random().toString(36).substring(2, 8),
          isSimulated: false,
          retrievalType: "Dense Vector Search (Qdrant Index)"
        });
        setIsRagSearching(false);
        return;
      }
    } catch (e) {
      console.warn("Connection to RAG API failed, falling back to local simulation", e);
    }

    // Client-side fallback matching
    setTimeout(() => {
      try {
        const localChunks: any[] = [];
        allFiles.forEach((file) => {
          if (file.chunks) {
            file.chunks.forEach((chunk) => {
              localChunks.push({
                content: chunk.originalText,
                fileName: file.name,
                pageNumber: chunk.page,
                fileType: chunk.type,
                summaryText: chunk.summaryText,
                isRaw: chunk.isRaw,
                metadata: chunk.metadata
              });
            });
          }
        });

        if (localChunks.length === 0) {
          setRagSearchResults({
            answer: "No document chunks are currently indexed in the registry. Please upload files above to parse them into searchable chunks.",
            sources: [],
            latency_ms: 10,
            trace_id: "local-sim-empty",
            isSimulated: true,
            retrievalType: "Local Database Scan (0 chunks found)"
          });
          setIsRagSearching(false);
          return;
        }

        const queryClean = ragSearchQuery.toLowerCase().trim();
        const queryTerms = queryClean.split(/\W+/).filter(t => t.length > 2);

        const scored = localChunks.map((item) => {
          const contentLower = item.content.toLowerCase();
          let score = 0.0;
          let matchCount = 0;

          if (queryTerms.length > 0) {
            queryTerms.forEach((term) => {
              if (contentLower.includes(term)) {
                matchCount++;
                const occurrences = contentLower.split(term).length - 1;
                score += 0.25 + (occurrences * 0.05);
              }
            });
            if (matchCount > 1) {
              score *= (1.0 + 0.3 * matchCount);
            }
          } else {
            if (contentLower.includes(queryClean)) {
              score += 0.5;
            }
          }

          const pseudoDistance = (Math.abs(Math.sin(item.content.length)) * 0.05);
          score = Math.min(0.98, score + pseudoDistance);

          return {
            ...item,
            score
          };
        });

        const matchedResults = scored
          .filter(x => x.score > 0.08 || queryTerms.length === 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        let answer = "";
        if (matchedResults.length > 0) {
          const topMatch = matchedResults[0];
          answer = `**[Simulated RAG Answer]** Synthesized response for query: *"${ragSearchQuery}"* using retrieved context:\n\n` +
            `From the document **${topMatch.fileName}** (Page ${topMatch.pageNumber}), the semantic search retrieved matching text with a similarity score of **${(topMatch.score * 100).toFixed(0)}%**:\n` +
            `> "${topMatch.content.substring(0, 240)}..."\n\n` +
            `In a production environment, the pipeline feeds these top chunks directly into the LLM system prompt context, enforcing grounding and preventing hallucination.`;
        } else {
          answer = `The retrieval engine scanned all ${localChunks.length} indexed chunks in the database but could not find a semantic match for your query: "${ragSearchQuery}".\n\n` +
            `Try adjusting your keywords or upload documents that contain content related to your search.`;
        }

        setRagSearchResults({
          answer,
          sources: matchedResults.map(m => ({
            content: m.content,
            score: m.score,
            metadata: {
              file_name: m.fileName,
              source: m.fileName,
              page_number: m.pageNumber,
              file_type: m.fileType,
              summary_text: m.summaryText,
              ...m.metadata
            }
          })),
          latency_ms: 20 + Math.random() * 30,
          trace_id: "sim-" + Math.random().toString(36).substring(2, 10),
          isSimulated: true,
          retrievalType: "Local Database Scan (Fallback Mode)"
        });
      } catch (err: any) {
        setRagSearchError(err?.message || "Simulation failed");
      } finally {
        setIsRagSearching(false);
      }
    }, 450);
  };

  const clearRagSearch = () => {
    setRagSearchQuery("");
    setRagSearchResults(null);
    setRagSearchError(null);
    fetchChunks();
  };

  useEffect(() => {
    if (!ragSearchQuery.trim()) {
      setRagSearchResults(null);
      setRagSearchError(null);
      fetchChunks();
    }
  }, [ragSearchQuery]);

  const onDeleteFileClick = async (filename: string, isMockFile: boolean) => {
    if (isMockFile) {
      if (window.confirm(`Are you sure you want to permanently delete mock document "${filename}"?`)) {
        setFiles(prev => prev.filter(f => f.name !== filename));
      }
    } else {
      if (window.confirm(`Are you sure you want to permanently delete document "${filename}" and all its vector chunks?`)) {
        await handleDeleteFile(filename);
      }
    }
  };

  const closeWizard = () => {
    setWizardActive(false);
    setRealIngestStatus({});
  };

  const wizardFiles = React.useMemo(() => {
    if (isMockMode) return files;
    
    const keys = Object.keys(realIngestStatus);
    if (keys.length > 0) {
      return keys.map((filename, idx) => {
        const info = realIngestStatus[filename];
        return {
          id: `real-ingest-${idx}-${filename}`,
          name: filename,
          size: "N/A",
          status: info.status === "completed" 
            ? ("completed" as const) 
            : info.status === "failed" 
            ? ("failed" as const) 
            : ("processing" as const),
          textCount: info.text_count || 0,
          tableCount: info.table_count || 0,
          imageCount: info.image_count || 0,
          titleCount: info.title_count || 0,
          otherCount: 0,
          totalElements: info.total_elements || 0,
          totalChunks: info.chunks_count || 0,
          summarizedChunks: info.chunks ? info.chunks.filter((c: any) => !c.isRaw).length : 0,
          chunks: info.chunks || []
        };
      });
    }
    
    return uploadedFilesList as unknown as ProcessingFile[];
  }, [isMockMode, files, realIngestStatus, uploadedFilesList]);

  const startIngestionWizard = (targetFileId?: string) => {
    setWizardActive(true);
    setActiveStep(targetFileId ? 3 : 1);
    setMaxStepReached(targetFileId ? 3 : 1);
    
    const selectFile = targetFileId 
      ? (wizardFiles.find(f => f.id === targetFileId) || wizardFiles[0])
      : wizardFiles[0];

    if (selectFile) {
      setOpenPartitionFiles({ [selectFile.id]: true });
      setOpenChunkFiles({ [selectFile.id]: true });
      setOpenRegistryFiles(prev => ({ ...prev, [selectFile.id]: true }));

      if (selectFile.chunks && selectFile.chunks.length > 0) {
        setSelectedChunk(selectFile.chunks[0]);
      } else {
        setSelectedChunk(null);
      }
    } else {
      setSelectedChunk(null);
    }
  };

  useEffect(() => {
    if (wizardActive && !selectedChunk) {
      const activeFilesList = wizardFiles;
      if (activeFilesList.length > 0 && activeFilesList[0].chunks && activeFilesList[0].chunks.length > 0) {
        setSelectedChunk(activeFilesList[0].chunks[0]);
        setOpenPartitionFiles({ [activeFilesList[0].id]: true });
        setOpenChunkFiles({ [activeFilesList[0].id]: true });
      }
    }
  }, [wizardActive, selectedChunk, wizardFiles]);

  useEffect(() => {
    if (!wizardActive) return;

    if (isMockMode) {
      if (maxStepReached < 3) {
        const stepDurations = [3500, 4500];
        const timer = setTimeout(() => {
          setMaxStepReached(prev => {
            const next = prev + 1;
            setActiveStep(next);
            return next;
          });
        }, stepDurations[maxStepReached - 1]);
        return () => clearTimeout(timer);
      }
    } else {
      const keys = Object.keys(realIngestStatus);
      if (keys.length > 0) {
        let minStep = 3;
        keys.forEach((filename) => {
          const info = realIngestStatus[filename];
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
        
        setMaxStepReached(prev => {
          if (minStep > prev) {
            setActiveStep(minStep);
            return minStep;
          }
          return prev;
        });
      }
    }
  }, [wizardActive, maxStepReached, isMockMode, realIngestStatus]);

  useEffect(() => {
    if (wizardActive && !isUploading && maxStepReached < 3) {
      setActiveStep(3);
      setMaxStepReached(3);
    }
  }, [isUploading, wizardActive, maxStepReached]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      startIngestionWizard();
      const mockEvent = {
        target: { files: e.dataTransfer.files }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(mockEvent);
    }
  };

  const onFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      startIngestionWizard();
      handleFileUpload(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!wizardActive ? (
        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
          
          {/* Grouped file registry list (Left Column) */}
          <FileRegistryList
            sortedGroupKeys={sortedGroupKeys}
            groupedFiles={groupedFiles}
            openRegistryFiles={openRegistryFiles}
            toggleRegistryAccordion={toggleRegistryAccordion}
            realIngestStatus={realIngestStatus}
            onDeleteFileClick={onDeleteFileClick}
            selectedChunk={selectedChunk}
            setSelectedChunk={setSelectedChunk}
            isRagSearching={isRagSearching}
            ragSearchError={ragSearchError}
            ragSearchResults={ragSearchResults}
            allFiles={allFiles}
            clearRagSearch={clearRagSearch}
            handleRagSearch={handleRagSearch}
            ragSearchQuery={ragSearchQuery}
            setRagSearchQuery={setRagSearchQuery}
          />

          {/* Dynamic settings / Detail Inspector / Metrics Panel (Right Column) */}
          <div className="w-full md:w-96 shrink-0 flex flex-col max-h-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm backdrop-blur-md bg-white/80 dark:bg-slate-900/80">
            {selectedChunk ? (
              <ChunkInspector
                selectedChunk={selectedChunk as any}
                setSelectedChunk={setSelectedChunk}
                inspectorTab={inspectorTab}
                setInspectorTab={setInspectorTab}
              />
            ) : selectedFile ? (
              <FileMetricsInspector
                selectedFile={selectedFile as any}
                setSelectedFileId={setSelectedFileId}
                setOpenRegistryFiles={setOpenRegistryFiles}
              />
            ) : (
              <IngestOverview
                status={status}
                fileInputRef={fileInputRef}
                isUploading={isUploading}
                handleDragOver={handleDragOver}
                handleDrop={handleDrop}
                onFileSelectChange={onFileSelectChange}
              />
            )}
          </div>
        </div>
      ) : (
        /* Multi-Step Wizard Pipeline (Visualizer modal active) */
        <PipelineVisualizer
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          maxStepReached={maxStepReached}
          closeWizard={closeWizard}
          isUploading={isUploading}
          handleCancelUpload={handleCancelUpload}
          wizardFiles={wizardFiles}
          openPartitionFiles={openPartitionFiles}
          togglePartitionAccordion={togglePartitionAccordion}
          openChunkFiles={openChunkFiles}
          toggleChunkAccordion={toggleChunkAccordion}
        />
      )}
    </div>
  );
}
