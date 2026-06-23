import { 
  X, 
  CheckCircle2, 
  Loader2, 
  FileText, 
  ChevronDown, 
  ChevronRight, 
  Sparkle 
} from "lucide-react";

interface PipelineVisualizerProps {
  activeStep: number;
  setActiveStep: (step: number) => void;
  maxStepReached: number;
  closeWizard: () => void;
  isUploading: boolean;
  handleCancelUpload: () => void;
  wizardFiles: any[];
  openPartitionFiles: Record<string, boolean>;
  togglePartitionAccordion: (fileId: string) => void;
  openChunkFiles: Record<string, boolean>;
  toggleChunkAccordion: (fileId: string) => void;
}

export function PipelineVisualizer({
  activeStep,
  setActiveStep,
  maxStepReached,
  closeWizard,
  isUploading,
  handleCancelUpload,
  wizardFiles,
  openPartitionFiles,
  togglePartitionAccordion,
  openChunkFiles,
  toggleChunkAccordion,
}: PipelineVisualizerProps) {
  
  // Aggregate stats from wizardFiles
  const totalUploaded = wizardFiles.length;
  const countFailed = wizardFiles.filter(f => f.status === "failed").length;
  const countProgress = wizardFiles.filter(f => f.status === "processing").length;
  const countSuccess = wizardFiles.filter(f => f.status === "completed").length;

  const sumTotalElements = wizardFiles.reduce((acc, f) => acc + (f.totalElements || 0), 0);
  const sumTotalChunks = wizardFiles.reduce((acc, f) => acc + (f.totalChunks || 0), 0);
  const sumSummarizedChunks = wizardFiles.reduce((acc, f) => acc + (f.summarizedChunks || 0), 0);
  const sumRawChunks = sumTotalChunks - sumSummarizedChunks;

  return (
    <div className="flex-1 flex flex-col bg-[#0b0f19] text-slate-200 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl animate-fade-in">
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
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Simplified 3-Step Progress Navigation Header Bar */}
      <div className="flex items-center px-6 py-2 border-b border-slate-900 bg-[#0c111e] overflow-x-auto gap-4 scrollbar-thin select-none">
        {[
          { id: 1, label: "1. Upload Status" },
          { id: 2, label: "2. Layout Partitioning" },
          { id: 3, label: "3. Chunking & Summarization" },
        ].map((step) => {
          const isStepCompleted = step.id < maxStepReached;
          const isStepActive = step.id === activeStep;

          return (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`relative py-2.5 px-3 text-xs font-semibold whitespace-nowrap transition-all duration-300 cursor-pointer ${
                isStepActive 
                  ? "text-primary border-b-2 border-primary" 
                  : isStepCompleted 
                    ? "text-emerald-500 hover:text-emerald-400" 
                    : "text-slate-400 hover:text-slate-200"
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
      <div className="flex-1 flex overflow-hidden flex-col">
        <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-[#0a0d16] items-center justify-start scrollbar-thin">
          
          {/* STEP 1: UPLOAD STATUS */}
          {activeStep === 1 && (
            <div className="flex-1 flex flex-col max-w-xl mx-auto w-full gap-6 justify-center animate-fade-in">
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
                <div className="space-y-3 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                  {wizardFiles.map((file) => (
                    <div key={file.id} className="flex justify-between items-center p-3 bg-[#0d1220] border border-slate-800/60 rounded-xl transition-all hover:bg-[#0f1524]">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-200 font-semibold truncate">{file.name}</span>
                        {file.size && <span className="text-[10px] text-slate-500 font-mono shrink-0">({file.size})</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
                        {file.status === "failed" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                            <X className="w-3 h-3" /> Failed
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
            <div className="flex-1 flex flex-col max-w-xl mx-auto w-full gap-6 justify-center animate-fade-in">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 text-primary w-6 h-6 animate-spin shrink-0" />
                <h4 className="text-base font-bold text-slate-100">Layout Partitioning Details</h4>
                <p className="text-xs text-slate-400 mt-1">Collapsible partitioning layout report for each uploaded file</p>
              </div>

              <div className="space-y-4 w-full max-h-[360px] overflow-y-auto scrollbar-thin pr-1">
                {wizardFiles.map((file) => {
                  const isOpen = !!openPartitionFiles[file.id];
                  return (
                    <div 
                      key={file.id} 
                      className="bg-[#111728] border border-slate-800 rounded-xl overflow-hidden shadow-md w-full transition-all"
                    >
                      {/* Collapsible Accordion Header */}
                      <div 
                        onClick={() => togglePartitionAccordion(file.id)}
                        className="flex justify-between items-center px-5 py-4 cursor-pointer hover:bg-slate-800/30 border-b border-slate-800/40 select-none"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-xs font-bold text-slate-100 truncate">{file.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] font-bold text-primary bg-primary/15 border border-primary/20 px-2 py-0.5 rounded-full">
                            {file.totalElements} elements
                          </span>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      {/* Accordion Content Grid */}
                      {isOpen && (
                        <div className="p-5 bg-[#0d1220] grid grid-cols-2 gap-4 animate-fade-in">
                          <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                            <span className="text-[11px] text-slate-400 font-semibold">Text sections</span>
                            <span className="text-xs font-bold text-slate-200">{file.textCount}</span>
                          </div>
                          <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                            <span className="text-[11px] text-slate-400 font-semibold">Tables (HTML)</span>
                            <span className="text-xs font-bold text-slate-200">{file.tableCount}</span>
                          </div>
                          <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                            <span className="text-[11px] text-slate-400 font-semibold">Images (extracted)</span>
                            <span className="text-xs font-bold text-slate-200">{file.imageCount}</span>
                          </div>
                          <div className="flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                            <span className="text-[11px] text-slate-400 font-semibold">Titles/Headers</span>
                            <span className="text-xs font-bold text-slate-200">{file.titleCount}</span>
                          </div>
                          <div className="col-span-2 flex justify-between items-center p-2.5 bg-[#0b0f19] border border-slate-800/60 rounded-lg">
                            <span className="text-[11px] text-slate-400 font-semibold">Other Layout Elements</span>
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
            <div className="flex-1 flex flex-col max-w-xl mx-auto w-full gap-6 justify-center animate-fade-in">
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
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5 border-b border-slate-800/40 pb-2 select-none">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Ingestion Summary & Pipeline Logs
                </div>
                
                <div className="divide-y divide-slate-850/60 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
                  {wizardFiles.map((file) => (
                    <div key={file.id} className="py-2.5 flex items-center justify-between text-xs transition-colors hover:bg-slate-850/20 px-1 rounded">
                      <div className="flex items-center gap-2 min-w-0">
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
              <div className="space-y-3 max-h-[220px] overflow-y-auto scrollbar-thin pr-1">
                {wizardFiles.map((file) => {
                  const isOpen = !!openChunkFiles[file.id];
                  return (
                    <div 
                      key={file.id} 
                      className="bg-[#111728] border border-slate-800 rounded-xl overflow-hidden w-full transition-all"
                    >
                      <div 
                        onClick={() => toggleChunkAccordion(file.id)}
                        className="flex justify-between items-center px-4 py-3 cursor-pointer hover:bg-slate-800/30 border-b border-slate-800/40 select-none text-xs"
                      >
                        <span className="font-semibold text-slate-200 truncate max-w-[220px]">{file.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {file.totalChunks} Chunks ({file.summarizedChunks} Summarized)
                          </span>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      {isOpen && (
                        <div className="p-4 bg-[#0d1220] text-xs space-y-2 text-slate-400 animate-fade-in">
                          <div className="flex justify-between">
                            <span>Elements partitioned</span>
                            <span className="font-semibold text-slate-200">{file.totalElements}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Semantic chunks created</span>
                            <span className="font-semibold text-slate-200">{file.totalChunks}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>AI vision summaries generated (GPT-4o)</span>
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
        </div>

        {/* Persistent Modal Footer */}
        <div className="shrink-0 w-full px-8 py-4 border-t border-slate-900 bg-[#0c111e] flex justify-end items-center gap-3">
          {isUploading && (
            <button
              onClick={handleCancelUpload}
              className="px-4 py-2 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Cancel Ingestion
            </button>
          )}
          <button
            onClick={closeWizard}
            className="px-6 py-2 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold transition shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Close & Run in Background</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Finish & Close</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
