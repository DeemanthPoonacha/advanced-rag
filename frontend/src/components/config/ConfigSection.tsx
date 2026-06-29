import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const accentClasses: Record<string, string> = {
  "yellow-500": "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
  "sky-500": "bg-sky-500/10 border-sky-500/20 text-sky-500",
  "violet-500": "bg-violet-500/10 border-violet-500/20 text-violet-500",
  "emerald-500": "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
  primary: "bg-primary/10 border-primary/20 text-primary",
};

interface ConfigSectionProps {
  icon: ReactNode;
  title: string;
  badge?: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  accentColor?: string;
}

export function ConfigSection({
  icon,
  title,
  badge,
  description,
  defaultOpen = false,
  children,
  accentColor = "primary",
}: ConfigSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const iconAccent = accentClasses[accentColor] || accentClasses.primary;

  return (
    <div
      className={`bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition-all duration-300 hover:shadow-md overflow-hidden ${
        isOpen
          ? "border-slate-300 dark:border-slate-700"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-5 text-left cursor-pointer group"
      >
        <div
          className={`flex items-center justify-center w-9 h-9 rounded-xl ${iconAccent} shrink-0 transition-transform duration-300 ${
            isOpen ? "scale-110" : "group-hover:scale-105"
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm font-display text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            {badge && (
              <span className="text-[8px] uppercase font-extrabold tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform duration-300 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`transition-all duration-300 ease-in-out ${
          isOpen
            ? "max-h-[5000px] opacity-100 border-t border-slate-200 dark:border-slate-700 pt-4"
            : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="px-5 pb-5 pt-1">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Subsection divider used within a ConfigSection to separate grouped controls
 */
interface SubsectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function Subsection({ title, icon, children }: SubsectionProps) {
  return (
    <div className="bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-700/50 rounded-xl p-4 space-y-3 transition-all duration-200 hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-600/60">
      <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200/60 dark:border-slate-700/40">
        {icon && (
          <span className="flex items-center justify-center w-5 h-5 rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h4>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/**
 * A smaller, nested collapsible for "Advanced Settings" within a section.
 */
interface AdvancedToggleProps {
  label?: string;
  sectionKey: string;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  children: ReactNode;
}

export function AdvancedToggle({
  label = "Advanced Settings",
  sectionKey,
  expandedSections,
  toggleSection,
  children,
}: AdvancedToggleProps) {
  const isExpanded = !!expandedSections[sectionKey];

  return (
    <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-1">
      <button
        type="button"
        onClick={() => toggleSection(sectionKey)}
        className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
      >
        <span>{label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
        } pb-4`}
      >
        <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
          {children}
        </div>
      </div>
    </div>
  );
}
