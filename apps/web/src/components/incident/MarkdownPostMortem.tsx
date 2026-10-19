'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MarkdownPostMortemProps {
  content: string;
}

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, '');

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 rounded-xl border border-gray-800 bg-[#070b14] overflow-hidden group">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/80 bg-gray-900/60 text-xs text-gray-400">
        <div className="flex items-center gap-1.5 font-mono">
          <Terminal className="h-3.5 w-3.5 text-blue-400" />
          <span>telemetry-snapshot</span>
        </div>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-[11px]"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto font-mono text-xs text-gray-200 leading-relaxed">
        <pre className={className}>
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

export function MarkdownPostMortem({ content }: MarkdownPostMortemProps) {
  if (!content) {
    return (
      <div className="p-8 text-center text-gray-500 italic">
        No post-mortem report synthesized yet. Click &quot;Re-Diagnose with AI&quot; to generate an analysis.
      </div>
    );
  }

  return (
    <div className="prose prose-invert max-w-none text-gray-200 space-y-4 text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white pb-3 border-b border-gray-800 flex items-center gap-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base sm:text-lg font-bold text-blue-400 mt-6 mb-2 flex items-center gap-2 border-l-2 border-blue-500 pl-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-gray-200 mt-4 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-gray-300 leading-relaxed my-2">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1.5 my-3 text-gray-300 marker:text-blue-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1.5 my-3 text-gray-300 marker:text-blue-400">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded bg-gray-900/80 px-1.5 py-0.5 font-mono text-xs text-blue-300 border border-gray-800"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-amber-500 bg-amber-500/10 p-3 rounded-r-lg my-3 text-amber-200 text-xs">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
