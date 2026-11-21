import {ArrowRight, Check, Copy} from 'lucide-react';
import {BenchmarkSummary, CompressionAlgorithmId} from '../lib/compression';
import {BpeEncoding} from '../lib/tokenizer';
import {copyTextToClipboard} from '../lib/browserUtils';

interface Props {
  prompt: string;
  summary: BenchmarkSummary;
  encoding: BpeEncoding;
  selected: CompressionAlgorithmId | 'auto';
  onSelect: (id: CompressionAlgorithmId) => void;
  onOpenCompressor: () => void;
  onNotify: (message: string) => void;
}

export function BenchmarkView({prompt, summary, encoding, selected, onSelect, onOpenCompressor, onNotify}: Props) {
  return <section className="algorithm-page">
    <div className="algorithm-intro"><div><p className="algorithm-kicker">PROMPTZIP / METHOD LAB</p><h1>One prompt. <em>Six approaches.</em></h1><p>Compare actual token counts for your current text. Pick a method to use in the compressor, then review its wording before sending.</p></div><button onClick={onOpenCompressor}>Edit prompt <ArrowRight size={16}/></button></div>
    <div className="algorithm-summary"><span>INPUT <strong>{summary.best.inputTokens}</strong> tokens</span><span>BEST BALANCED RESULT <strong>{summary.best.outputTokens}</strong> tokens</span><span>ENCODING <strong>{encoding}</strong></span></div>
    <div className="algorithm-grid">
      {summary.results.map((result) => {
        const isBest = result.algorithm.id === summary.best.algorithm.id;
        const isSelected = selected === result.algorithm.id || (selected === 'auto' && isBest);
        return <article key={result.algorithm.id} className={`algorithm-card ${isSelected ? 'is-selected' : ''}`}>
          <div className="algorithm-card-head"><span className="algorithm-index">{String(summary.results.indexOf(result) + 1).padStart(2, '0')} / 06</span>{isBest && <span className="algorithm-badge">Best balance</span>}</div>
          <h2>{result.algorithm.shortName}</h2><p className="algorithm-description">{result.algorithm.description}</p>
          <div className="algorithm-meter"><span>Token difference</span><strong>{result.savedTokens >= 0 ? '−' : '+'}{Math.abs(result.savedTokens)} <small>tokens</small></strong><div className="algorithm-track"><i style={{width: `${Math.max(0, Math.min(100, 100 - result.reductionPct))}%`}}/></div><span>{result.inputTokens} → {result.outputTokens} · {result.reductionPct.toFixed(1)}% reduction</span></div>
          <div className="algorithm-preview"><span>OUTPUT PREVIEW</span><pre>{result.output || 'Enter a prompt in Compressor to compare methods.'}</pre></div>
          <div className="algorithm-card-actions"><button onClick={() => {onSelect(result.algorithm.id); onOpenCompressor();}}>{isSelected ? <Check size={15}/> : <ArrowRight size={15}/>} {isSelected ? 'Use selected method' : 'Use this method'}</button><button aria-label={`Copy ${result.algorithm.shortName} output`} disabled={!prompt.trim()} onClick={async () => onNotify(await copyTextToClipboard(result.output) ? 'Copied output' : 'Could not access clipboard')}><Copy size={16}/></button></div>
        </article>;
      })}
    </div>
    <p className="algorithm-footnote">These numbers count only this prompt with the selected GPT tokenizer. Retention checks track terms and do not certify meaning. Read every output before use.</p>
  </section>;
}
