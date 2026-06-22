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
  
  // Track open state of collapsible accordions (mapping fileId -> boolean)
  const [openPartitionFiles, setOpenPartitionFiles] = useState<Record<string, boolean>>({});
  const [openChunkFiles, setOpenChunkFiles] = useState<Record<string, boolean>>({});
  const [openRegistryFiles, setOpenRegistryFiles] = useState<Record<string, boolean>>({});

  const closeWizard = () => {
    setWizardActive(false);
  };

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
      summarizedChunks: 0, // Plain text is treated raw, no AI summarization
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

  // Launch visual wizard simulation
  const startIngestionWizard = () => {
    setWizardActive(true);
    setActiveStep(1);
    
    // Automatically set accordions open by default
    setOpenPartitionFiles({ f1: true, f2: false, f3: false });
    setOpenChunkFiles({ f1: true, f2: false, f3: false });
    setOpenRegistryFiles({ f1: true, f2: false, f3: false });

    // Set first chunk selected
    setSelectedChunk(files[0].chunks[0]);
  };

  // Auto-progress simulation logic
  useEffect(() => {
    if (wizardActive && activeStep < 4) {
      const stepDurations = [3500, 4500, 4500]; // Upload, Partition, Chunking durations
      const timer = setTimeout(() => {
        setActiveStep(prev => prev + 1);
      }, stepDurations[activeStep - 1]);
      return () => clearTimeout(timer);
    }
  }, [wizardActive, activeStep]);

  useEffect(() => {
    if (wizardActive && !isUploading && activeStep > 1) {
      setActiveStep(4);
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
  const totalUploaded = files.length;
  const countFailed = files.filter(f => f.status === "failed").length;
  const countProgress = isUploading ? 1 : 0;
  const countSuccess = files.filter(f => f.status === "completed").length - countProgress;

  // Step 3 helper aggregates
  const sumTotalElements = files.reduce((acc, f) => acc + f.totalElements, 0);
  const sumTotalChunks = files.reduce((acc, f) => acc + f.totalChunks, 0);
  const sumSummarizedChunks = files.reduce((acc, f) => acc + f.summarizedChunks, 0);
  const sumRawChunks = sumTotalChunks - sumSummarizedChunks;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {!wizardActive ? (
        // --- VIEW A: Drag-and-Drop Ingestion Home Screen ---
        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
          <div className="flex-1 flex flex-col gap-6 max-h-full overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
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
                <div className="text-xs text-slate-400">Supports PDF, DOCX, TXT, or Markdown (Upload multiple files)</div>
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

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex-1 flex flex-col min-h-[300px]">
              <h3 className="text-md font-bold mb-4 font-display">Ingested Files Registry</h3>
              {uploadLogs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                  <Database className="w-12 h-12 text-slate-300 dark:text-slate-800 mb-2" />
                  <p className="text-sm">No files uploaded yet in this session</p>
                  <p className="text-xs text-slate-400 mt-1">Upload files above to compile the RAG registry.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                        <th className="py-2.5">Document Filename</th>
                        <th className="py-2.5">Generated Chunks</th>
                        <th className="py-2.5">Uploaded Date</th>
                        <th className="py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadLogs.map((log, idx) => (
                        <tr
                          key={idx}
                          onClick={() => {
                            startIngestionWizard();
                            setActiveStep(4);
                          }}
                          className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 cursor-pointer"
                        >
                          <td className="py-3 font-medium max-w-[280px] truncate pr-4">{log.filename}</td>
                          <td className="py-3 font-semibold text-primary">{log.chunks_count} chunks</td>
                          <td className="py-3 text-slate-500">{log.date}</td>
                          <td className="py-3 text-right">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                              compiled
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Status Summary */}
          <div className="w-full md:w-80 flex flex-col gap-6 shrink-0 max-h-full overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-md font-bold mb-4 font-display">Ingestion Engine Settings</h3>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500">Parser Model</span>
                  <span className="font-semibold">{status?.parser_provider || "unstructured"}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500">Chunking Strategy</span>
                  <span className="font-semibold">{status?.chunker_provider || "semantic"}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500">DB Schema Collection</span>
                  <span className="font-semibold">{status?.collection_name || "documents"}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500">Indexing Engine</span>
                  <span className="font-semibold text-accent">{status?.vector_store_provider || "qdrant"}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-md font-bold mb-2 font-display text-primary">Multi-Modal RAG</h3>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Hi-res partitioning processes document layouts to extract text blocks, tables, and images. Chunks with complex visuals are summarized using Vision LLMs, while text-only chunks remain raw. During answer synthesis, original high-fidelity layout data is loaded directly into the LLM context.
              </p>
            </div>
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

          {/* Simplified 4-Step Progress Navigation Header Bar */}
          <div className="flex items-center px-6 py-2 border-b border-slate-900 bg-[#0c111e] overflow-x-auto gap-4">
            {[
              { id: 1, label: "1. Upload Status" },
              { id: 2, label: "2. Layout Partitioning" },
              { id: 3, label: "3. Chunking & Summarization" },
              { id: 4, label: "4. Chunks Registry" },
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
                    ) : isStepActive && step.id < 4 ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : null}
                    {step.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Main Visualizer Window split panel */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Content Window */}
            <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-[#0a0d16]">
              
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
                      {files.map((file) => (
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

                  <div className="space-y-4">
                    {files.map((file) => {
                      const isOpen = !!openPartitionFiles[file.id];
                      return (
                        <div 
                          key={file.id} 
                          className="bg-[#111728] border border-slate-800 rounded-xl overflow-hidden shadow-md"
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

                  {/* Collapsible details list */}
                  <div className="space-y-3">
                    {files.map((file) => {
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
                </div>
              )}

              {/* STEP 4: CHUNKS REGISTRY */}
              {activeStep === 4 && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h4 className="text-sm font-bold text-slate-100">Files Chunks Registry</h4>
                    <span className="text-xs text-slate-500">Interactive search & inspector</span>
                  </div>

                  {/* Search box */}
                  <div className="relative mb-4 shrink-0">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search chunks in all files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#111728] border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary/50"
                    />
                  </div>

                  {/* List of files with collapsible accordion of chunks */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {files.map((file) => {
                      const isOpen = !!openRegistryFiles[file.id];
                      const matchedChunks = file.chunks.filter(c => searchQuery === "" || c.originalText.toLowerCase().includes(searchQuery.toLowerCase()) || c.summaryText.toLowerCase().includes(searchQuery.toLowerCase()));
                      
                      // Skip rendering file if search yields no results
                      if (matchedChunks.length === 0 && searchQuery !== "") return null;

                      return (
                        <div 
                          key={file.id} 
                          className="bg-[#111728] border border-slate-800 rounded-xl overflow-hidden shadow-sm"
                        >
                          {/* Accordion File Header */}
                          <div 
                            onClick={() => toggleRegistryAccordion(file.id)}
                            className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-slate-800/30 border-b border-slate-800/40 select-none"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary" />
                              <span className="text-xs font-semibold text-slate-200">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({matchedChunks.length} chunks)
                              </span>
                              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {/* Expanded list of chunks under file */}
                          {isOpen && (
                            <div className="p-3 bg-[#0d1220] space-y-2">
                              {matchedChunks.map((chunk) => {
                                const isSelected = selectedChunk?.id === chunk.id;
                                return (
                                  <div
                                    key={chunk.id}
                                    onClick={() => setSelectedChunk(chunk)}
                                    className={`p-3 rounded-lg border cursor-pointer text-left transition-all duration-300 ${
                                      isSelected
                                        ? "bg-[#151f32] border-primary/40 shadow-md"
                                        : "bg-[#111728] border-slate-800/80 hover:bg-[#12192b]"
                                    }`}
                                  >
                                    <div className="flex justify-between items-center mb-1.5">
                                      <div className="flex gap-1.5 items-center">
                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[8px] font-bold text-slate-400 capitalize">
                                          {chunk.type}
                                        </span>
                                        {chunk.isRaw ? (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-bold text-emerald-400">
                                            raw
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-[8px] font-bold text-yellow-400">
                                            summarized
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[9px] text-slate-500">Page {chunk.page}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                                      {chunk.snippet}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel: Detail Inspector */}
            <div className="w-80 border-l border-slate-800/80 bg-[#0c111e] flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-850 shrink-0 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-100 tracking-wide">Detail Inspector</span>
              </div>

              {activeStep !== 4 || !selectedChunk ? (
                // Empty state when processing or no chunk selected
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center gap-2">
                  <div className="p-3 bg-[#111728] border border-slate-800/80 rounded-full mb-2">
                    <Eye className="w-6 h-6 text-slate-600" />
                  </div>
                  <span className="text-xs font-semibold text-slate-400">Preview Inspector</span>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Select a chunk in Step 4 to inspect original content, summaries, and metadata.
                  </p>
                </div>
              ) : (
                // Full Inspector Tab Interface
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Selector tabs */}
                  <div className="flex border-b border-slate-800 px-4 py-2 shrink-0 gap-1.5">
                    {[
                      { key: "original", label: "Original Text" },
                      { key: "summary", label: "AI Summary" },
                      { key: "metadata", label: "Metadata" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setInspectorTab(tab.key as any)}
                        className={`flex-1 py-1 px-1.5 text-center rounded-md text-[9px] font-bold border transition-all duration-300 ${
                          inspectorTab === tab.key
                            ? "bg-[#151f32] text-primary border-primary/20"
                            : "bg-[#111728] text-slate-400 border-slate-800/60 hover:text-slate-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Inspector view content */}
                  <div className="flex-1 overflow-y-auto p-4 text-xs">
                    {/* ORIGINAL TEXT VIEW */}
                    {inspectorTab === "original" && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wide">
                            Original Content
                          </div>
                          <div className="bg-[#111728] p-3 border border-slate-800/80 rounded-xl leading-relaxed text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                            {selectedChunk.originalText}
                          </div>
                        </div>

                        {selectedChunk.type === "image" && (
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wide">
                              Images (1)
                            </div>
                            <div className="bg-[#111728] p-3 border border-slate-800/80 rounded-xl flex flex-col gap-2 items-center justify-center">
                              {/* Transformer Architecture Diagram representation */}
                              <div className="w-full aspect-[4/3] bg-[#0c111e] rounded-lg border border-slate-800 flex flex-col p-2 text-[9px] font-semibold text-slate-400">
                                <div className="text-center font-bold text-slate-300 uppercase mb-1">Transformer Encoder-Decoder</div>
                                <div className="flex-1 flex gap-2 justify-center py-2">
                                  <div className="w-16 bg-[#16223f] border border-primary/20 rounded-md p-1 flex flex-col justify-between">
                                    <div className="text-center font-bold text-primary">Encoder</div>
                                    <div className="bg-[#10192e] border border-slate-800 text-center p-0.5 rounded">Feed Forward</div>
                                    <div className="bg-[#10192e] border border-slate-800 text-center p-0.5 rounded">Multi-Head Attn</div>
                                  </div>
                                  <div className="w-16 bg-[#1f1a30] border border-accent/20 rounded-md p-1 flex flex-col justify-between">
                                    <div className="text-center font-bold text-accent">Decoder</div>
                                    <div className="bg-[#141020] border border-slate-850 text-center p-0.5 rounded">Feed Forward</div>
                                    <div className="bg-[#141020] border border-slate-850 text-center p-0.5 rounded">Masked Attn</div>
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
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          Searchable Summary (GPT-4o)
                        </div>
                        {selectedChunk.isRaw ? (
                          <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-emerald-400 text-[11px] leading-relaxed flex gap-2">
                            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold block mb-1">No AI Summary needed</span>
                              This chunk contains plain text, which is parsed and indexed directly in raw form to optimize latency, save token costs, and maintain high-fidelity accuracy.
                            </div>
                          </div>
                        ) : (
                          <div className="bg-[#111728] p-3 border border-slate-800/80 rounded-xl leading-relaxed text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                            {selectedChunk.summaryText}
                          </div>
                        )}
                      </div>
                    )}

                    {/* METADATA VIEW */}
                    {inspectorTab === "metadata" && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          Chunk Metadata Parameters
                        </div>
                        <div className="bg-[#111728] border border-slate-800/80 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <tbody>
                              {Object.entries(selectedChunk.metadata).map(([key, value]) => (
                                <tr key={key} className="border-b border-slate-800/40">
                                  <td className="p-2.5 font-bold text-slate-400 border-r border-slate-800/40 bg-[#0d1220] select-none capitalize">
                                    {key.replace("_", " ")}
                                  </td>
                                  <td className="p-2.5 text-slate-200 break-all select-text font-mono">
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
