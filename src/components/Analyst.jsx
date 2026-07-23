import { useState, useRef, useEffect } from 'react';
import { downloadFilledModel } from '../lib/excelModel';

// Lightweight markdown-ish renderer: **bold**, line breaks, bullet dashes.
function RichText({ text }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className={line.trim().startsWith('-') || line.trim().startsWith('•') ? 'pl-3' : ''}>
            {parts.map((p, j) =>
              p.startsWith('**') && p.endsWith('**')
                ? <strong key={j} className="text-amber-300 font-bold">{p.slice(2, -2)}</strong>
                : <span key={j}>{p}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}

// Download button + quick summary shown under an underwrite reply
function ModelDownload({ model }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const noi = model?.noi;
  const target = model?.scenarios?.find(s => s.name === 'target');
  const estimated = model?.expenses?.estimated;

  async function handleDownload() {
    setBusy(true); setErr(null);
    try {
      await downloadFilledModel(model, model.facilityName || 'Underwriting');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-700">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-2">
        {noi != null && <span><span className="text-slate-500">NOI</span> <strong className="text-emerald-400">${Math.round(noi).toLocaleString()}</strong></span>}
        {target && <span><span className="text-slate-500">Target cap</span> <strong className="text-amber-400">{(target.capRate * 100).toFixed(2)}%</strong></span>}
        {target?.price > 0 && <span><span className="text-slate-500">@</span> <strong className="text-white">${Math.round(target.price).toLocaleString()}</strong></span>}
        {estimated && <span className="text-slate-500 italic">expenses estimated</span>}
      </div>
      <button
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/30 font-bold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-50"
      >
        {busy ? 'Building…' : 'Download Excel Model'}
      </button>
      {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
    </div>
  );
}

const SUGGESTIONS = [
  'Gross revenue $540k/yr, expenses ~58% of EGI, 401 units, 42,000 sqft, asking $4.5M — underwrite it and give me the Excel model.',
  'If NOI is $310k and a buyer wants a 6.5% cap, what should they pay?',
  'Walk me through how vacancy assumptions change the value on a lease-up deal.',
];

export default function Analyst() {
  const [messages, setMessages] = useState([]); // {role, content (string for display), apiContent (blocks)}
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]); // {name, block}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function handleFile(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
          // Parse spreadsheet client-side → text the model can read
          // (xlsx is heavy; load it only when a spreadsheet is attached)
          const XLSX = await import('xlsx');
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          let text = `[Spreadsheet: ${file.name}]\n`;
          wb.SheetNames.forEach(name => {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
            text += `\n=== Sheet: ${name} ===\n${csv}\n`;
          });
          setAttachments(prev => [...prev, { name: file.name, block: { type: 'text', text } }]);
        } else if (file.name.match(/\.pdf$/i)) {
          const b64 = await fileToBase64(file);
          setAttachments(prev => [...prev, {
            name: file.name,
            block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          }]);
        } else {
          // Plain text fallback
          const text = await file.text();
          setAttachments(prev => [...prev, { name: file.name, block: { type: 'text', text: `[File: ${file.name}]\n${text}` } }]);
        }
      } catch (err) {
        setError(`Couldn't read ${file.name}: ${err.message}`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function send(text) {
    const userText = (text ?? input).trim();
    if (!userText && attachments.length === 0) return;

    // Build the API content blocks for this user turn
    const blocks = [...attachments.map(a => a.block)];
    if (userText) blocks.push({ type: 'text', text: userText });

    const displayText = userText + (attachments.length ? `\n\nFile ${attachments.map(a => a.name).join(', ')}` : '');
    const newUserMsg = { role: 'user', content: displayText, apiContent: blocks };

    const nextMessages = [...messages, newUserMsg];
    setMessages(nextMessages);
    setInput('');
    setAttachments([]);
    setLoading(true);
    setError(null);

    // Assemble full history in Anthropic format
    const apiMessages = nextMessages.map(m => ({
      role: m.role,
      content: m.apiContent ?? m.content,
    }));

    try {
      const res = await fetch('/api/analyst', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, model: data.model }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-900 font-black text-lg shadow">
          AI
        </div>
        <div>
          <h2 className="text-lg font-black text-white leading-tight">AI Analyst</h2>
          <p className="text-xs text-slate-500">Underwriting · deal analysis · your financial model, built in</p>
        </div>
      </div>

      {/* Chat thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div className="text-5xl mb-3">AI</div>
            <p className="text-slate-400 font-semibold mb-1">Your personal underwriting analyst</p>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
              Give me back-of-napkin numbers, or upload a rent roll / P&L / occupancy report and I'll
              run it through your team's model — NOI, 3-scenario valuation, cap rate, DSCR, cash-on-cash.
            </p>
            <div className="space-y-2 max-w-lg mx-auto">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="w-full text-left text-sm bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/40 rounded-xl px-4 py-2.5 text-slate-300 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              m.role === 'user'
                ? 'bg-amber-500 text-slate-900 font-medium whitespace-pre-wrap'
                : 'bg-slate-800 border border-slate-700 text-slate-200'
            }`}>
              {m.role === 'user' ? m.content : <RichText text={m.content} />}
              {m.role === 'assistant' && m.model && (
                <ModelDownload model={m.model} />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-slate-400">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">Crunching the numbers</span>
                <span className="animate-bounce">.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <span key={i} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
              File {a.name}
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400">x</button>
            </span>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="mt-3 flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach rent roll, P&L, occupancy report (PDF / Excel / CSV)"
          className="flex-shrink-0 w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 hover:border-amber-500/40 text-slate-400 hover:text-amber-400 transition-all text-lg"
        >
          File
        </button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,.txt" onChange={handleFile} className="hidden" />
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Ask me to underwrite a deal, or attach a P&L / rent roll..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none max-h-32"
        />
        <button
          onClick={() => send()}
          disabled={loading || (!input.trim() && attachments.length === 0)}
          className={`flex-shrink-0 px-5 h-11 rounded-xl font-bold text-sm transition-all ${
            loading || (!input.trim() && attachments.length === 0)
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-400 text-slate-900'
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
