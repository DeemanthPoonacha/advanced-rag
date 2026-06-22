import React, { useState, useEffect } from "react";
import { 
  X,
  UploadCloud, 
  Database, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  ChevronDown,
  ChevronRight,
  Eye,
  Info,
  Sparkle,
  Search
} from "lucide-react";
import { RAGStatus, UploadLog } from "../types";

interface IngestPanelProps {
  status: RAGStatus | null;
  isUploading: boolean;
  uploadLogs: UploadLog[];
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
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
  fileInputRef,
}: IngestPanelProps) {
  const [wizardActive, setWizardActive] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedChunk, setSelectedChunk] = useState<ChunkData | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"original" | "summary" | "metadata">("original");
  const [searchQuery, setSearchQuery] = useState("");

  // Sample files that are processed during ingestion simulation
  const [files] = useState<ProcessingFile[]>([
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
  
  // Track open state of collapsible accordions (mapping fileId -> boolean)
  const [openPartitionFiles, setOpenPartitionFiles] = useState<Record<string, boolean>>({});
  const [openChunkFiles, setOpenChunkFiles] = useState<Record<string, boolean>>({});
  const [openRegistryFiles, setOpenRegistryFiles] = useState<Record<string, boolean>>({});

  const [apiChunks, setApiChunks] = useState<any[]>([]);

  useEffect(() => {
    const fetchChunks = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/chunks?limit=250");
        if (res.ok) {
          const data = await res.json();
          setApiChunks(data.chunks || []);
        }
      } catch (e) {
        console.error("Failed to fetch API chunks", e);
      }
    };
    fetchChunks();
  }, [uploadLogs, status]);

  const [ragSearchQuery, setRagSearchQuery] = useState("");
  const [isRagSearching, setIsRagSearching] = useState(false);
  const [ragSearchResults, setRagSearchResults] = useState<any | null>(null);
  const [ragSearchError, setRagSearchError] = useState<string | null>(null);



  // Unified files mapping and sorting/grouping
  const mockFilesList = files?.map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    status: file.status,
    uploadTime: file.name === "read_me.txt" ? "Jun 21, 2026, 04:20 PM" : "Jun 22, 2026, 10:30 AM",
    chunksCount: file.totalChunks,
    chunks: file.chunks,
    isMock: true,
  }));

  const uploadedFilesList = uploadLogs.map((log, idx) => {
    const matchedChunks = apiChunks.filter((c) => {
      const docName = (c.metadata?.file_name || c.metadata?.source || "").toLowerCase();
      const logName = log.filename.toLowerCase();
      const cleanDoc = docName.split("/").pop() || "";
      const cleanLog = logName.split("/").pop() || "";
      return (
        cleanDoc === cleanLog ||
        cleanDoc.endsWith(cleanLog) ||
        cleanLog.endsWith(cleanDoc)
      );
    });

    const formattedChunks = matchedChunks.map((c, cIdx) => ({
      id: c.id || `${log.filename}-chunk-${cIdx}`,
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

    const textCount = formattedChunks.filter(c => c.type === "text").length;
    const tableCount = formattedChunks.filter(c => c.type === "table").length;
    const imageCount = formattedChunks.filter(c => c.type === "image").length;
    const titleCount = formattedChunks.filter(c => c.metadata?.title_extracted).length;
    const otherCount = 0;
    const totalChunks = formattedChunks.length || log.chunks_count || 0;
    const totalElements = textCount + tableCount + imageCount || totalChunks || 1;
    const summarizedChunks = formattedChunks.filter(c => !c.isRaw).length;

    return {
      id: `uploaded-${idx}-${log.filename}`,
      name: log.filename,
      size: "N/A",
      status: "completed" as const,
      uploadTime: log.date,
      textCount,
      tableCount,
      imageCount,
      titleCount,
      otherCount,
      totalElements,
      totalChunks,
      summarizedChunks,
      chunks: formattedChunks,
      isMock: false,
    };
  });

  const isMockMode = status?.mock_mode || false;
  const allFiles = isMockMode ? [...uploadedFilesList, ...mockFilesList] : uploadedFilesList;

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
  };

  useEffect(() => {
    if (!ragSearchQuery.trim()) {
      setRagSearchResults(null);
      setRagSearchError(null);
    }
  }, [ragSearchQuery]);

  const closeWizard = () => {
    setWizardActive(false);
  };



  // Handle accordion toggles
  const togglePartitionAccordion = (fileId: string) => {
    setOpenPartitionFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const toggleChunkAccordion = (fileId: string) => {
    setOpenChunkFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const toggleRegistryAccordion = (fileId: string) => {
    setOpenRegistryFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  // Select active files with potential in-progress upload item appended dynamically
  const activeUploadFiles = React.useMemo(() => {
    const list = isMockMode ? files : (uploadedFilesList as unknown as ProcessingFile[]);
    if (isUploading) {
      let tempName = "Uploading document...";
      if (fileInputRef.current && fileInputRef.current.files && fileInputRef.current.files.length > 0) {
        tempName = Array.from(fileInputRef.current.files).map(f => f.name).join(", ");
      }
      
      const alreadyPresent = list.some(f => f.name === tempName);
      if (!alreadyPresent) {
        return [
          {
            id: "temp-upload-item",
            name: tempName,
            size: "Calculating...",
            status: "processing" as const,
            textCount: 0,
            tableCount: 0,
            imageCount: 0,
            titleCount: 0,
            otherCount: 0,
            totalElements: 0,
            totalChunks: 0,
            summarizedChunks: 0,
            chunks: []
          },
          ...list
        ];
      }
    }
    return list;
  }, [isMockMode, files, uploadedFilesList, isUploading]);

  const wizardFiles = activeUploadFiles;

  // Launch visual wizard simulation
  const startIngestionWizard = (targetFileId?: string) => {
    setWizardActive(true);
    setActiveStep(targetFileId ? 3 : 1);
    
    const selectFile = targetFileId 
      ? (activeUploadFiles.find(f => f.id === targetFileId) || activeUploadFiles[0])
      : activeUploadFiles[0];

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

  // Automatically select the first chunk when files become available
  useEffect(() => {
    if (wizardActive && !selectedChunk) {
      const activeFilesList = isMockMode ? files : (uploadedFilesList as unknown as ProcessingFile[]);
      if (activeFilesList.length > 0 && activeFilesList[0].chunks && activeFilesList[0].chunks.length > 0) {
        setSelectedChunk(activeFilesList[0].chunks[0]);
        setOpenPartitionFiles({ [activeFilesList[0].id]: true });
        setOpenChunkFiles({ [activeFilesList[0].id]: true });
      }
    }
  }, [wizardActive, selectedChunk, isMockMode, files, uploadedFilesList]);

  // Auto-progress simulation logic
  useEffect(() => {
    if (wizardActive && activeStep < 3) {
      const stepDurations = [3500, 4500]; // Upload, Partition durations
      const timer = setTimeout(() => {
        setActiveStep(prev => prev + 1);
      }, stepDurations[activeStep - 1]);
      return () => clearTimeout(timer);
    }
  }, [wizardActive, activeStep]);

  useEffect(() => {
    if (wizardActive && !isUploading && activeStep > 1) {
      setActiveStep(3);
    }
  }, [isUploading]);

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

  // Step 1 helper aggregates
  const totalUploaded = wizardFiles.length;
  const countFailed = wizardFiles.filter(f => f.status === "failed").length;
  const countProgress = wizardFiles.filter(f => f.status === "processing").length;
  const countSuccess = wizardFiles.filter(f => f.status === "completed").length;

  // Step 3 helper aggregates
  const sumTotalElements = wizardFiles.reduce((acc, f) => acc + f.totalElements, 0);
  const sumTotalChunks = wizardFiles.reduce((acc, f) => acc + f.totalChunks, 0);
  const sumSummarizedChunks = wizardFiles.reduce((acc, f) => acc + f.summarizedChunks, 0);
  const sumRawChunks = sumTotalChunks - sumSummarizedChunks;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!wizardActive ? (
        // --- VIEW A: Drag-and-Drop Ingestion Home Screen ---
        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
          <div className="flex-1 flex flex-col gap-6 max-h-full overflow-y-auto">
           

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex-1 flex flex-col min-h-[300px] overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 shrink-0">
                <h3 className="text-md font-bold font-display">Ingested Files Registry</h3>
                
                {/* RAG Retrieval Search Bar */}
                <div className="relative w-full md:w-80 shrink-0">
                  <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Retrieve matching document chunks (Press Enter)..."
                    value={ragSearchQuery}
                    onChange={(e) => setRagSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRagSearch();
                      }
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                  />
                  {ragSearchQuery && (
                    <button
                      onClick={clearRagSearch}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer animate-fade-in"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isRagSearching ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-sm font-semibold">Interrogating Vector Index...</p>
                  <p className="text-xs text-slate-500">Retrieving most relevant document chunks and synthesizing answer</p>
                </div>
              ) : ragSearchError ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 gap-2">
                  <Info className="w-8 h-8 text-rose-500" />
                  <p className="text-sm font-bold text-rose-500">Search failed</p>
                  <p className="text-xs text-slate-500">{ragSearchError}</p>
                  <button
                    onClick={clearRagSearch}
                    className="mt-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Reset Registry View
                  </button>
                </div>
              ) : ragSearchResults ? (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Retrieval Metadata and Control Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/80">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Active Query Filter
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 italic">
                        "{ragSearchQuery}"
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-2">
                        <span>Latency: {ragSearchResults.latency_ms?.toFixed(0)}ms</span>
                        <span>•</span>
                        <span>Trace ID: {ragSearchResults.trace_id?.substring(0, 8)}...</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded font-sans text-[8px] font-bold ${
                        ragSearchResults.isSimulated 
                          ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" 
                          : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      }`}>
                        {ragSearchResults.retrievalType || "Vector DB Search"}
                      </span>
                      <button
                        onClick={clearRagSearch}
                        className="text-[10px] text-rose-500 hover:text-rose-600 font-bold hover:underline cursor-pointer transition flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-3"
                      >
                        <X className="w-3 h-3" /> Clear Results
                      </button>
                    </div>
                  </div>

                  {/* Retrieved Sources */}
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                      Retrieved Source Chunks ({ragSearchResults.sources?.length || 0})
                    </div>
                    {ragSearchResults.sources && ragSearchResults.sources.length > 0 ? (
                      <div className="space-y-3">
                        {ragSearchResults.sources.map((source: any, idx: number) => {
                          const chunkObj = {
                            id: `retrieved-${idx}`,
                            page: source.metadata?.page_number || 1,
                            type: (source.metadata?.file_type === "image" || source.metadata?.image_extracted)
                              ? ("image" as const)
                              : source.metadata?.table_extracted
                              ? ("table" as const)
                              : ("text" as const),
                            snippet: source.content ? (source.content.length > 120 ? source.content.substring(0, 120) + "..." : source.content) : "",
                            originalText: source.content || "",
                            summaryText: source.metadata?.summary_text || "",
                            isRaw: !source.metadata?.summary_text,
                            metadata: source.metadata || {},
                          };

                          const isSelected = selectedChunk?.originalText === source.content;
                          const scorePercent = (source.score * 100).toFixed(0);

                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedChunk(chunkObj)}
                              className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                                isSelected
                                  ? "bg-primary/5 border-primary/45 shadow-sm"
                                  : "bg-slate-50/40 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/40 hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                              }`}
                            >
                              <div className="flex justify-between items-center mb-1.5">
                                <div className="flex gap-1.5 items-center">
                                  <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[8px] font-bold text-primary">
                                    Rank #{idx + 1}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-bold text-emerald-500">
                                    Score: {scorePercent}%
                                  </span>
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px] font-semibold">
                                    {source.metadata?.file_name || source.metadata?.source || "Unknown Document"}
                                  </span>
                                </div>
                                <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                                  Page {source.metadata?.page_number || 1}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                {source.content}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        No sources returned for this query.
                      </div>
                    )}
                  </div>
                </div>
              ) : allFiles.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                  <Database className="w-12 h-12 text-slate-300 dark:text-slate-800 mb-2" />
                  <p className="text-sm">No files ingested yet</p>
                  <p className="text-xs text-slate-400 mt-1">Upload files above to compile the RAG registry.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-6 pr-1">
                  {sortedGroupKeys.map((groupKey) => {
                    const groupFiles = groupedFiles[groupKey];
                    return (
                      <div key={groupKey} className="space-y-3">
                        {/* Group Header */}
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2">
                          <Database className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                          <span>{groupKey}</span>
                          <span className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800/80 ml-2" />
                        </div>

                        {/* Files list under group */}
                        <div className="space-y-3">
                          {groupFiles.map((file) => {
                            const isExpanded = !!openRegistryFiles[file.id];
                            return (
                              <div
                                key={file.id}
                                className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700/80 shadow-sm"
                              >
                                {/* File Card Header */}
                                <div
                                  onClick={() => toggleRegistryAccordion(file.id)}
                                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition select-none"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                                    )}
                                    <FileText className="w-4 h-4 text-primary shrink-0" />
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                        {file.name}
                                      </div>
                                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                                        Uploaded: {file.uploadTime}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-md">
                                      {file.chunksCount} chunks
                                    </span>
                                    {file.size && file.size !== "N/A" && (
                                      <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        {file.size}
                                      </span>
                                    )}
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md capitalize">
                                      compiled
                                    </span>
                                    
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        startIngestionWizard(file.id);
                                      }}
                                      className="ml-2 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/30 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                                      title="Open Multi-Step Processing Pipeline Visualizer"
                                    >
                                      Details
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Chunks list */}
                                {isExpanded && (
                                  <div className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/20 p-4 space-y-3">
                                    {file.chunks && file.chunks.length > 0 ? (
                                      <div className="space-y-3">
                                        {file.chunks.map((chunk) => {
                                          const isSelected = selectedChunk?.id === chunk.id;
                                          return (
                                            <div
                                              key={chunk.id}
                                              onClick={() => setSelectedChunk(chunk)}
                                              className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                                                isSelected
                                                  ? "bg-primary/5 border-primary/45 shadow-sm"
                                                  : "bg-slate-50/40 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/40 hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                                              }`}
                                            >
                                              <div className="flex justify-between items-center mb-1.5">
                                                <div className="flex gap-1.5 items-center">
                                                  <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[8px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">
                                                    Page {chunk.page}
                                                  </span>
                                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/60 text-[8px] font-bold text-slate-500 dark:text-slate-400 capitalize">
                                                    {chunk.type}
                                                  </span>
                                                  {chunk.isRaw ? (
                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-bold text-emerald-500">
                                                      raw
                                                    </span>
                                                  ) : (
                                                    <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-[8px] font-bold text-yellow-600 dark:text-yellow-500">
                                                      summarized
                                                    </span>
                                                  )}
                                                </div>
                                                <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                                                  ID: {chunk.id}
                                                </span>
                                              </div>
                                              <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                                {chunk.originalText || chunk.snippet}
                                              </p>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500">
                                        No chunks generated or indexed for this document.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Dynamic Settings / Detail Inspector */}
          <div className="w-full md:w-96 shrink-0 flex flex-col max-h-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm">
            {selectedChunk ? (
              // --- DETAIL INSPECTOR ---
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-slate-850 dark:text-slate-100 tracking-wide uppercase">Detail Inspector</span>
                  </div>
                  <button
                    onClick={() => setSelectedChunk(null)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-850 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition cursor-pointer"
                    title="Close Inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Selector tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 py-2 shrink-0 gap-1.5 bg-slate-50/50 dark:bg-slate-950/10">
                  {[
                    { key: "original", label: "Original Text" },
                    { key: "summary", label: "AI Summary" },
                    { key: "metadata", label: "Metadata" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setInspectorTab(tab.key as any)}
                      className={`flex-1 py-1.5 px-2 text-center rounded-lg text-[10px] font-bold border transition-all duration-305 cursor-pointer ${
                        inspectorTab === tab.key
                          ? "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 shadow-sm"
                          : "bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-850 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Inspector view content */}
                <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
                  {/* ORIGINAL TEXT VIEW */}
                  {inspectorTab === "original" && (
                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wide">
                          Original Content
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl leading-relaxed text-slate-700 dark:text-slate-300 font-mono text-[11px] whitespace-pre-wrap select-text">
                          {selectedChunk.originalText}
                        </div>
                      </div>

                      {selectedChunk.type === "image" && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wide">
                            Images (1)
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-950 p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col gap-2 items-center justify-center">
                            {/* Transformer Architecture Diagram representation */}
                            <div className="w-full aspect-[4/3] bg-white dark:bg-[#0c111e] rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col p-2 text-[9px] font-semibold text-slate-500 dark:text-slate-400 shadow-inner">
                              <div className="text-center font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Transformer Encoder-Decoder</div>
                              <div className="flex-1 flex gap-2 justify-center py-2">
                                <div className="w-16 bg-[#16223f]/10 border border-primary/20 rounded-md p-1 flex flex-col justify-between">
                                  <div className="text-center font-bold text-primary">Encoder</div>
                                  <div className="bg-white dark:bg-[#10192e] border border-slate-200 dark:border-slate-800 text-center p-0.5 rounded shadow-sm text-[8px]">Feed Forward</div>
                                  <div className="bg-white dark:bg-[#10192e] border border-slate-200 dark:border-slate-800 text-center p-0.5 rounded shadow-sm text-[8px]">Multi-Head Attn</div>
                                </div>
                                <div className="w-16 bg-[#1f1a30]/10 border border-accent/20 rounded-md p-1 flex flex-col justify-between">
                                  <div className="text-center font-bold text-accent">Decoder</div>
                                  <div className="bg-white dark:bg-[#141020] border border-slate-200 dark:border-slate-850 text-center p-0.5 rounded shadow-sm text-[8px]">Feed Forward</div>
                                  <div className="bg-white dark:bg-[#141020] border border-slate-200 dark:border-slate-855 text-center p-0.5 rounded shadow-sm text-[8px]">Masked Attn</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI SUMMARY VIEW */}
                  {inspectorTab === "summary" && (
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        Searchable Summary (GPT-4o)
                      </div>
                      {selectedChunk.isRaw ? (
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400 text-[11px] leading-relaxed flex gap-2">
                          <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold block mb-1">No AI Summary needed</span>
                            This chunk contains plain text, which is parsed and indexed directly in raw form to optimize latency, save token costs, and maintain high-fidelity accuracy.
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl leading-relaxed text-slate-700 dark:text-slate-300 font-mono text-[11px] whitespace-pre-wrap select-text">
                          {selectedChunk.summaryText}
                        </div>
                      )}
                    </div>
                  )}

                  {/* METADATA VIEW */}
                  {inspectorTab === "metadata" && (
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        Chunk Metadata Parameters
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-inner">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <tbody>
                            {Object.entries(selectedChunk.metadata).map(([key, value]) => (
                              <tr key={key} className="border-b border-slate-200 dark:border-slate-800/40">
                                <td className="p-2.5 font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-850 bg-slate-100/50 dark:bg-[#0d1220] select-none capitalize">
                                  {key.replace("_", " ")}
                                </td>
                                <td className="p-2.5 text-slate-700 dark:text-slate-200 break-all select-text font-mono">
                                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // --- SETTINGS AND OVERVIEW (Default State) ---
              <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

                 <div className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <h3 className="text-md font-bold mb-1 font-display">Ingest Documents</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Upload multiple documents. Layouts will be partitioned (extracting text, tables, and images), and summarized dynamically using Vision models. Plain text is treated raw and skipped from summaries.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary dark:hover:border-primary rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-50 dark:bg-slate-950/20 hover:bg-primary/5 transition-all duration-300"
              >
                <UploadCloud className="w-12 h-12 text-primary animate-pulse" />
                <div className="text-sm font-semibold">Click or drag files to upload</div>
                <div className="text-xs text-slate-400">Supports PDF, DOCX, CSV, PPTX, TXT, or Markdown (Upload multiple files)</div>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={onFileSelectChange}
                  className="hidden"
                  disabled={isUploading}
                />
              </div>
            </div>
                <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-1">
                  <h3 className="text-xs font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">Ingestion Engine Settings</h3>
                </div>
                <div className="space-y-4 text-xs">
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <span className="text-slate-500">Parser Model</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{status?.parser_provider || "unstructured"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <span className="text-slate-500">Chunking Strategy</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{status?.chunker_provider || "semantic"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <span className="text-slate-500">DB Schema Collection</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{status?.collection_name || "documents"}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span className="text-slate-500">Indexing Engine</span>
                    <span className="font-semibold text-accent">{status?.vector_store_provider || "qdrant"}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/5 border border-primary/10 dark:border-primary/20 rounded-xl p-5 shadow-sm mt-2">
                  <h3 className="text-xs font-bold mb-2 font-display text-primary flex items-center gap-1.5">
                    <Sparkle className="w-3.5 h-3.5 text-primary" />
                    Multi-Modal RAG
                  </h3>
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    Hi-res partitioning processes document layouts to extract text blocks, tables, and images. Chunks with complex visuals are summarized using Vision LLMs, while text-only chunks remain raw. During answer synthesis, original high-fidelity layout data is loaded directly into the LLM context.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // --- VIEW B: Multi-Step Processing Pipeline Visualizer ---
        <div className="flex-1 flex flex-col bg-[#0b0f19] text-slate-200 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          {/* Header Panel */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800/80 bg-[#0f1524]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Multi-File Processing Ingestion</h3>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-0.5">Ingestion Status Dashboard</p>
              </div>
            </div>
            <button 
              onClick={closeWizard} 
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Simplified 3-Step Progress Navigation Header Bar */}
          <div className="flex items-center px-6 py-2 border-b border-slate-900 bg-[#0c111e] overflow-x-auto gap-4">
            {[
              { id: 1, label: "1. Upload Status" },
              { id: 2, label: "2. Layout Partitioning" },
              { id: 3, label: "3. Chunking & Summarization" },
            ].map((step) => {
              const isStepCompleted = step.id < activeStep;
              const isStepActive = step.id === activeStep;
              const isStepAccessible = step.id <= activeStep;

              return (
                <button
                  key={step.id}
                  disabled={!isStepAccessible}
                  onClick={() => setActiveStep(step.id)}
                  className={`relative py-2.5 px-3 text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                    isStepActive 
                      ? "text-primary border-b-2 border-primary" 
                      : isStepCompleted 
                        ? "text-emerald-500 hover:text-emerald-400" 
                        : isStepAccessible 
                          ? "text-slate-400 hover:text-slate-200" 
                          : "text-slate-700 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {isStepCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : isStepActive && step.id < 3 ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : null}
                    {step.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Main Visualizer Window */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-[#0a0d16] items-center justify-start">
              
              {/* STEP 1: UPLOAD STATUS */}
              {activeStep === 1 && (
                <div className="flex-1 flex flex-col max-w-xl mx-auto w-full gap-6 justify-center">
                  <div className="text-center">
                    <h4 className="text-base font-bold text-slate-100">Document Upload Summary</h4>
                    <p className="text-xs text-slate-400 mt-1">Uploading multi-modal document files to the parsing queue</p>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-[#111728] border border-slate-800 p-4 rounded-xl text-center shadow-sm">
                      <span className="text-[10px] uppercase font-bold text-slate-500">In Progress</span>
                      <div className={`text-2xl font-bold mt-1 ${countProgress > 0 ? "text-primary animate-pulse" : "text-slate-300"}`}>
                        {countProgress}
                      </div>
                    </div>
                    <div className="bg-[#111728] border border-slate-800 p-4 rounded-xl text-center shadow-sm">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Uploaded</span>
                      <div className="text-2xl font-bold mt-1 text-emerald-500">{countSuccess}</div>
                    </div>
                    <div className="bg-[#111728] border border-slate-800 p-4 rounded-xl text-center shadow-sm">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Failed</span>
                      <div className="text-2xl font-bold mt-1 text-rose-500">{countFailed}</div>
                    </div>
                  </div>

                  {/* File List status */}
                  <div className="bg-[#111728] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-3">
                    <div className="text-xs font-bold text-primary mb-3 uppercase tracking-wide">Files List ({totalUploaded})</div>
                    <div className="space-y-3">
                      {wizardFiles.map((file) => (
                        <div key={file.id} className="flex justify-between items-center p-3 bg-[#0d1220] border border-slate-800/60 rounded-xl">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            <span className="text-xs text-slate-200 font-semibold">{file.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({file.size})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {file.status === "completed" && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Completed
                              </span>
                            )}
                            {file.status === "processing" && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                <Loader2 className="w-3 h-3 animate-spin" /> In Progress
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: LAYOUT PARTITIONING */}
              {activeStep === 2 && (
                <div className="flex-1 flex flex-col max-w-xl mx-auto w-full gap-6 justify-center">
                  <div className="text-center">
                    <h4 className="text-base font-bold text-slate-100">Layout Partitioning Details</h4>
                    <p className="text-xs text-slate-400 mt-1">Collapsible partitioning layout report for each uploaded file</p>
                  </div>

                  <div className="space-y-4 w-full">
                    {wizardFiles.map((file) => {
                      const isOpen = !!openPartitionFiles[file.id];
                      return (
                        <div 
                          key={file.id} 
                          className="bg-[#111728] border border-slate-800 rounded-xl overflow-hidden shadow-md w-full"
                        >
                          {/* Collapsible Accordion Header */}
                          <div 
                            onClick={() => togglePartitionAccordion(file.id)}
                            className="flex justify-between items-center px-5 py-4 cursor-pointer hover:bg-slate-800/30 border-b border-slate-800/40 select-none"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary" />
                              <span className="text-xs font-bold text-slate-100">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-bold text-primary bg-primary/15 border border-primary/20 px-2 py-0.5 rounded-full">
                                {file.totalElements} elements
                              </span>
                              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {/* Accordion Content Grid */}
                          {isOpen && (
                            <div className="p-5 bg-[#0d1220] grid grid-cols-2 gap-4">
                              <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                                <span className="text-[11px] text-slate-400">Text sections</span>
                                <span className="text-xs font-bold text-slate-200">{file.textCount}</span>
                              </div>
                              <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                                <span className="text-[11px] text-slate-400">Tables (extracted as HTML)</span>
                                <span className="text-xs font-bold text-slate-200">{file.tableCount}</span>
                              </div>
                              <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                                <span className="text-[11px] text-slate-400">Images (base64 extracted)</span>
                                <span className="text-xs font-bold text-slate-200">{file.imageCount}</span>
                              </div>
                              <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                                <span className="text-[11px] text-slate-400">Titles/Headers</span>
                                <span className="text-xs font-bold text-slate-200">{file.titleCount}</span>
                              </div>
                              <div className="col-span-2 flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                                <span className="text-[11px] text-slate-400">Other Layout Elements</span>
                                <span className="text-xs font-bold text-slate-200">{file.otherCount}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: CHUNKING & SUMMARIZATION */}
              {activeStep === 3 && (
                <div className="flex-1 flex flex-col max-w-xl mx-auto w-full gap-6 justify-center">
                  <div className="text-center">
                    <h4 className="text-base font-bold text-slate-100">Detailed Chunking & Summarization Results</h4>
                    <p className="text-xs text-slate-400 mt-1">Chunking and AI-enhanced vision summarization breakdown</p>
                  </div>

                  {/* Summary Metric Stats Card */}
                  <div className="bg-[#111728] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="text-xs font-bold text-primary uppercase tracking-wide">Pipeline Overview</div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-[#0d1220] border border-slate-800/60 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Total Elements</span>
                        <div className="text-lg font-bold text-slate-100 mt-1">{sumTotalElements}</div>
                      </div>
                      <div className="p-3 bg-[#0d1220] border border-slate-800/60 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Total Chunks Created</span>
                        <div className="text-lg font-bold text-slate-100 mt-1">{sumTotalChunks}</div>
                      </div>
                      <div className="p-3 bg-[#0d1220] border border-[#f59e0b]/20 rounded-xl">
                        <span className="text-[10px] text-yellow-500 font-bold uppercase flex items-center gap-1">
                          <Sparkle className="w-3.5 h-3.5 text-yellow-500 animate-spin" /> AI Summarized Chunks
                        </span>
                        <div className="text-lg font-bold text-yellow-500 mt-1">{sumSummarizedChunks}</div>
                        <span className="text-[9px] text-slate-500 block mt-1">Chunks containing tables/images</span>
                      </div>
                      <div className="p-3 bg-[#0d1220] border border-emerald-500/20 rounded-xl">
                        <span className="text-[10px] text-emerald-500 font-bold uppercase flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Plain Text (Treated Raw)
                        </span>
                        <div className="text-lg font-bold text-emerald-500 mt-1">{sumRawChunks}</div>
                        <span className="text-[9px] text-slate-500 block mt-1">Skipped from LLM summaries</span>
                      </div>
                    </div>
                  </div>

                  {/* Enhanced Detailed Uploaded & Ingested Document Compilation Summary */}
                  <div className="bg-[#111728] border border-slate-800/80 rounded-2xl p-5 shadow-xl space-y-3">
                    <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-800/40 pb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Ingestion Summary & Pipeline Logs
                    </div>
                    
                    <div className="divide-y divide-slate-800/60 max-h-[160px] overflow-y-auto pr-1">
                      {wizardFiles.map((file) => (
                        <div key={file.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="font-semibold text-slate-200 truncate max-w-[200px]">{file.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex gap-2 shrink-0">
                            <span>{file.totalElements} elements</span>
                            <span>•</span>
                            <span className="text-primary font-bold">{file.totalChunks} chunks</span>
                            <span>•</span>
                            <span className="text-yellow-500 font-bold">{file.summarizedChunks} summarized</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Collapsible details list */}
                  <div className="space-y-3">
                    {wizardFiles.map((file) => {
                      const isOpen = !!openChunkFiles[file.id];
                      return (
                        <div 
                          key={file.id} 
                          className="bg-[#111728] border border-slate-800 rounded-xl overflow-hidden"
                        >
                          <div 
                            onClick={() => toggleChunkAccordion(file.id)}
                            className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-slate-800/30 border-b border-slate-800/40 select-none text-xs"
                          >
                            <span className="font-semibold text-slate-200">{file.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-400 font-medium">
                                {file.totalChunks} Chunks ({file.summarizedChunks} Summarized, {file.totalChunks - file.summarizedChunks} Raw)
                              </span>
                              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {isOpen && (
                            <div className="p-4 bg-[#0d1220] text-xs space-y-2 text-slate-400">
                              <div className="flex justify-between">
                                <span>Elements partitioned</span>
                                <span className="font-semibold text-slate-200">{file.totalElements}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Semantic chunks created</span>
                                <span className="font-semibold text-slate-200">{file.totalChunks}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>AI vision summaries generated (gpt-4o)</span>
                                <span className="font-semibold text-yellow-500">{file.summarizedChunks}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Raw text chunks (indexed directly)</span>
                                <span className="font-semibold text-emerald-500">{file.totalChunks - file.summarizedChunks}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Finish Button */}
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={closeWizard}
                      className="px-6 py-2.5 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold transition shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Finish & Close Pipeline</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
