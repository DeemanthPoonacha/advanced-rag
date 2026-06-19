import React from "react";
import { HelpCircle } from "lucide-react";

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="relative inline-flex items-center ml-1.5 tooltip-trigger cursor-help group">
      <HelpCircle className="w-3.5 h-3.5 text-slate-400 hover:text-primary transition-colors duration-150" />
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 text-[10px] font-normal leading-normal text-white bg-slate-900 border border-slate-700 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-1 group-hover:translate-y-0 transition-all duration-200 z-50 tooltip-content">
        {text}
      </span>
    </span>
  );
}
