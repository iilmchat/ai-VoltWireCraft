import { PlanCanvas } from './components/PlanCanvas.js';
import { selectNodeList, useGraphStore } from './store/graph-store.js';

/** Корневой компонент клиента. */
export function App(): React.JSX.Element {
  const graph = useGraphStore((state) => state.graph);
  const nodes = useGraphStore(selectNodeList);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectNode = useGraphStore((state) => state.selectNode);

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">VoltWireCraft</h1>
        <p className="text-sm text-slate-400">
          Проект: {graph.name} · узлов: {nodes.length} · связей: {graph.edges.length}
        </p>
      </header>

      <div className="flex flex-wrap gap-6">
        <section aria-label="План этажа">
          <PlanCanvas />
        </section>

        <aside className="min-w-64 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Элементы графа</h2>
          <ul className="space-y-2">
            {nodes.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => selectNode(node.id)}
                  className={`w-full rounded px-3 py-2 text-left text-sm ${
                    node.id === selectedNodeId
                      ? 'bg-sky-700 text-white'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <span className="font-medium">{node.label}</span>
                  <span className="ml-2 text-xs text-slate-400">{node.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
