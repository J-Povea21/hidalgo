/**
 * A ClickUp card as it will be created. Criteria can be edited in place; an
 * edit is a change, so it bumps the revision and the adversary re-probes it.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CardFields, Item } from '../../../shared/contract.ts';
import { toSafeHtml } from '../../ui/markdown.tsx';

const inline = (s: string) => ({ __html: toSafeHtml(s).replace(/^<p>|<\/p>\s*$/g, '') });

export function CardView(props: { item: Item; editable: boolean; onEdit: (path: string, text: string) => void }) {
  const f = props.item.fields as unknown as CardFields;
  const fresh = useFresh(props.item);
  return (
    <>
      <div class="section">
        <dl class="proposal">
          <dt>Priority</dt><dd dangerouslySetInnerHTML={inline(f.proposal.priority)} />
          <dt>Shape</dt><dd dangerouslySetInnerHTML={inline(f.proposal.shape)} />
          <dt>Status</dt><dd dangerouslySetInnerHTML={inline(f.proposal.status)} />
          <dt>Related</dt><dd dangerouslySetInnerHTML={inline(f.proposal.related)} />
        </dl>
      </div>
      <div class="section body">
        <h3>What</h3><div dangerouslySetInnerHTML={{ __html: toSafeHtml(f.body.what) }} />
        <h3>Where</h3><ul>{f.body.where.map((w, k) => <li key={k} dangerouslySetInnerHTML={inline(w)} />)}</ul>
        {f.body.why && <><h3>Why</h3><div dangerouslySetInnerHTML={{ __html: toSafeHtml(f.body.why) }} /></>}
        {f.body.outOfScope && <><h3>Out of scope</h3><div dangerouslySetInnerHTML={{ __html: toSafeHtml(f.body.outOfScope) }} /></>}
        {f.body.notes && <><h3>Notes</h3><div dangerouslySetInnerHTML={{ __html: toSafeHtml(f.body.notes) }} /></>}
      </div>
      <div class="section">
        <p class="label">Acceptance criteria</p>
        <ul class="ac">
          {f.criteria.map((c, k) => (
            <Criterion key={k} prefix={`[${c.mode}]`} text={c.text} path={`criteria.${k}.text`} fresh={fresh.has(`criteria.${k}.text`)}
              edited={!!props.item.edits?.[`criteria.${k}.text`]} editable={props.editable} onEdit={props.onEdit} />
          ))}
        </ul>
      </div>
      {f.manualQa.length > 0 && (
        <div class="section">
          <p class="label">Manual QA</p>
          <ul class="ac">
            {f.manualQa.map((t, k) => (
              <Criterion key={k} text={t} path={`manualQa.${k}`} fresh={fresh.has(`manualQa.${k}`)}
                edited={!!props.item.edits?.[`manualQa.${k}`]} editable={props.editable} onEdit={props.onEdit} />
            ))}
          </ul>
        </div>
      )}
      <div class="section">
        {f.assuming.length > 0 && <div class="assume"><b>Assuming</b><ul>{f.assuming.map((a, k) => <li key={k} dangerouslySetInnerHTML={inline(a)} />)}</ul></div>}
        <p class="meta" style={{ margin: f.assuming.length ? '10px 0 0' : 0 }}>{f.provenance}</p>
      </div>
    </>
  );
}

function Criterion(p: { prefix?: string; text: string; path: string; fresh: boolean; edited: boolean; editable: boolean; onEdit: (path: string, text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(p.text);
  useEffect(() => setValue(p.text), [p.text]);
  return (
    <li class={p.fresh ? 'fresh' : ''}>
      {p.prefix && <span class="mode">{p.prefix}</span>}
      {editing ? (
        <span class="txt">
          <textarea rows={2} aria-label="Edit criterion" value={value} onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)} />
          <span style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button class="primary" disabled={!value.trim() || value === p.text} onClick={() => { p.onEdit(p.path, value); setEditing(false); }}>Save edit</button>
            <button class="ghost" onClick={() => { setValue(p.text); setEditing(false); }}>Cancel</button>
          </span>
        </span>
      ) : (
        <span class="txt">
          <span dangerouslySetInnerHTML={inline(p.text)} />
          {p.edited && <span class="edited">edited by you · will be re-probed</span>}
        </span>
      )}
      {p.editable && !editing && <button class="link" onClick={() => setEditing(true)}>Edit</button>}
    </li>
  );
}

/** Which text fields changed since the last render, so they can flash once. */
function useFresh(item: Item): Set<string> {
  const prev = useRef<{ id: string; rev: number; fields: CardFields } | undefined>(undefined);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const f = item.fields as unknown as CardFields;
    const before = prev.current;
    if (before && before.id === item.id && before.rev !== item.rev) {
      const changed = new Set<string>();
      f.criteria.forEach((c, k) => { if (before.fields.criteria[k]?.text !== c.text) changed.add(`criteria.${k}.text`); });
      f.manualQa.forEach((t, k) => { if (before.fields.manualQa[k] !== t) changed.add(`manualQa.${k}`); });
      setFresh(changed);
      const t = setTimeout(() => setFresh(new Set()), 1700);
      prev.current = { id: item.id, rev: item.rev, fields: f };
      return () => clearTimeout(t);
    }
    prev.current = { id: item.id, rev: item.rev, fields: f };
    return undefined;
  }, [item.id, item.rev]);
  return fresh;
}
