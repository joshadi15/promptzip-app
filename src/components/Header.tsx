import { LogoMark } from './LogoMark';

export type WorkspaceTab =
  | 'workbench'
  | 'benchmark'
  | 'cli'
  | 'anti-slop';

interface HeaderProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
}

export const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'workbench', label: 'Compressor' },
  { id: 'benchmark', label: 'Algorithms' },
  { id: 'cli', label: 'CLI & Formats' },
  { id: 'anti-slop', label: 'Prompt Review' },
];

export function Header({ activeTab, onSelectTab }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button className="brand" aria-label="PromptZip compressor" onClick={() => onSelectTab('workbench')}><LogoMark />PromptZip</button>
        <nav aria-label="Workspace sections">
          {NAV_ITEMS.map(item => (
            <button key={item.id} aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => onSelectTab(item.id)}>{item.label}</button>
          ))}
        </nav>
      </div>
    </header>
  );
}
