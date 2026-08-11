export interface SourceStatusData {
  readonly snapshotDate: string;
  readonly snapshotMeta: string;
  readonly profileSchema: string;
  readonly semanticSchema: string;
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly sourceSize: string;
  readonly sourceSnapshot: string;
  readonly profileGeneratedAt: string;
  readonly semanticGeneratedAt: string;
}

interface SourceStatusProps {
  source: SourceStatusData;
}

export function SourceStatus({ source }: SourceStatusProps) {
  return (
    <aside id="snapshotMeta" className="source-status" aria-labelledby="source-status-title">
      <div className="source-status__heading">
        <span className="status-dot" aria-hidden="true" />
        <p>Proyección validada</p>
      </div>
      <h2 id="source-status-title">{source.snapshotDate}</h2>
      <p className="source-status__detail">{source.snapshotMeta}</p>
      <dl className="source-status__facts">
        <div>
          <dt>Perfil</dt>
          <dd>{source.profileSchema}</dd>
        </div>
        <div>
          <dt>Semántica</dt>
          <dd>{source.semanticSchema}</dd>
        </div>
        <div>
          <dt>Tamaño</dt>
          <dd>{source.sourceSize}</dd>
        </div>
      </dl>
      <details className="source-status__details">
        <summary>Ver identidad técnica</summary>
        <dl>
          <div><dt>Archivo</dt><dd>{source.sourceFile}</dd></div>
          <div><dt>SHA-256</dt><dd className="source-status__hash">{source.sourceHash}</dd></div>
          <div><dt>Corte de fuente</dt><dd>{source.sourceSnapshot}</dd></div>
          <div><dt>Perfil generado</dt><dd>{source.profileGeneratedAt}</dd></div>
          <div><dt>Semántica generada</dt><dd>{source.semanticGeneratedAt}</dd></div>
        </dl>
      </details>
    </aside>
  );
}
