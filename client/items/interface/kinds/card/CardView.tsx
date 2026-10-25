import { useEffect, useRef, useState } from 'preact/hooks';
import type { CardFields, ItemOf } from '@shared/contract.ts';
import type { KindViewProps } from '@client/items/interface/kinds/types.ts';
import { toInlineHtml, toSafeHtml } from '@client/common/interface/ui/markdown.tsx';
import { CLASS, classes } from '@client/common/interface/ui/classes.ts';

/** How long a changed criterion stays highlighted: the length of its flash animation. */
const FLASH_MS = 1700;

/**
 * A ClickUp card as it will be created. Criteria can be edited in place; an
 * edit is a change, so it bumps the revision and the adversary re-probes it.
 */
export function CardView(props: KindViewProps<'card'>) {
  const { fields } = props.item;
  const fresh = useFresh(props.item);
  return (
    <>
      {fields.tags.length > 0 && (
        <div class="section chips">
          {fields.tags.map((tag) => (
            <span class="chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div class="section">
        <dl class="proposal">
          <dt>Priority</dt>
          <dd dangerouslySetInnerHTML={inline(fields.proposal.priority)} />
          <dt>Shape</dt>
          <dd dangerouslySetInnerHTML={inline(fields.proposal.shape)} />
          <dt>Status</dt>
          <dd dangerouslySetInnerHTML={inline(fields.proposal.status)} />
          <dt>Related</dt>
          <dd dangerouslySetInnerHTML={inline(fields.proposal.related)} />
        </dl>
      </div>
      <div class="section body">
        <h3>What</h3>
        <div dangerouslySetInnerHTML={{ __html: toSafeHtml(fields.body.what) }} />
        <h3>Where</h3>
        <ul>
          {fields.body.where.map((location, index) => (
            <li key={index} dangerouslySetInnerHTML={inline(location)} />
          ))}
        </ul>
        {fields.body.why && (
          <>
            <h3>Why</h3>
            <div dangerouslySetInnerHTML={{ __html: toSafeHtml(fields.body.why) }} />
          </>
        )}
        {fields.body.outOfScope && (
          <>
            <h3>Out of scope</h3>
            <div dangerouslySetInnerHTML={{ __html: toSafeHtml(fields.body.outOfScope) }} />
          </>
        )}
        {fields.body.notes && (
          <>
            <h3>Notes</h3>
            <div dangerouslySetInnerHTML={{ __html: toSafeHtml(fields.body.notes) }} />
          </>
        )}
      </div>
      <div class="section">
        <p class="label">Acceptance criteria</p>
        <ul class="ac">
          {fields.criteria.map((criterion, index) => (
            <Criterion
              key={index}
              prefix={`[${criterion.mode}]`}
              text={criterion.text}
              path={`criteria.${index}.text`}
              fresh={fresh.has(`criteria.${index}.text`)}
              edited={!!props.item.edits?.[`criteria.${index}.text`]}
              editable={props.editable}
              onEdit={props.onEdit}
            />
          ))}
        </ul>
      </div>
      {fields.manualQa.length > 0 && (
        <div class="section">
          <p class="label">Manual QA</p>
          <ul class="ac">
            {fields.manualQa.map((check, index) => (
              <Criterion
                key={index}
                text={check}
                path={`manualQa.${index}`}
                fresh={fresh.has(`manualQa.${index}`)}
                edited={!!props.item.edits?.[`manualQa.${index}`]}
                editable={props.editable}
                onEdit={props.onEdit}
              />
            ))}
          </ul>
        </div>
      )}
      <div class="section">
        {fields.assuming.length > 0 && (
          <div class="assume">
            <b>Assuming</b>
            <ul>
              {fields.assuming.map((assumption, index) => (
                <li key={index} dangerouslySetInnerHTML={inline(assumption)} />
              ))}
            </ul>
          </div>
        )}
        <p class={classes('meta provenance', fields.assuming.length > 0 && CLASS.afterList)}>{fields.provenance}</p>
      </div>
    </>
  );
}

function inline(markdown: string) {
  return { __html: toInlineHtml(markdown) };
}

interface CriterionProps {
  prefix?: string;
  text: string;
  path: string;
  fresh: boolean;
  edited: boolean;
  editable: boolean;
  onEdit: (path: string, text: string) => void;
}

function Criterion(props: CriterionProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.text);
  const box = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // While editing, the user's text is theirs: a new revision from Claude only replaces it once they're done.
  useEffect(() => {
    if (!editing) {
      setValue(props.text);
    }
  }, [props.text, editing]);
  useEffect(() => {
    if (editing) {
      box.current?.focus();
    }
  }, [editing]);
  const stop = () => {
    setEditing(false);
    setTimeout(() => opener.current?.focus());
  };
  const cancel = () => {
    setValue(props.text);
    stop();
  };
  return (
    <li class={props.fresh ? 'fresh' : ''}>
      {props.prefix && <span class="mode">{props.prefix}</span>}
      {editing ? (
        <span class="txt">
          <textarea
            rows={2}
            aria-label="Edit criterion"
            ref={box}
            value={value}
            onInput={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
            }}
          />
          <span class="edit-actions">
            <button
              class="primary"
              disabled={!value.trim() || value === props.text}
              onClick={() => {
                props.onEdit(props.path, value);
                stop();
              }}
            >
              Save edit
            </button>
            <button class="ghost" onClick={cancel}>
              Cancel
            </button>
          </span>
        </span>
      ) : (
        <span class="txt">
          <span dangerouslySetInnerHTML={inline(props.text)} />
          {props.edited && <span class="edited">edited by you · will be re-probed</span>}
        </span>
      )}
      {props.editable && !editing && (
        <button class="link" ref={opener} onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </li>
  );
}

/** Which text fields changed since the last render, so they can flash once. */
function useFresh(item: ItemOf<'card'>): Set<string> {
  const prev = useRef<{ id: string; rev: number; fields: CardFields } | undefined>(undefined);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const { fields } = item;
    const before = prev.current;
    if (before && before.id === item.id && before.rev !== item.rev) {
      const changed = new Set<string>();
      fields.criteria.forEach((criterion, index) => {
        if (before.fields.criteria[index]?.text !== criterion.text) {
          changed.add(`criteria.${index}.text`);
        }
      });
      fields.manualQa.forEach((check, index) => {
        if (before.fields.manualQa[index] !== check) {
          changed.add(`manualQa.${index}`);
        }
      });
      setFresh(changed);
      const timer = setTimeout(() => setFresh(new Set()), FLASH_MS);
      prev.current = { id: item.id, rev: item.rev, fields: fields };
      return () => clearTimeout(timer);
    }
    prev.current = { id: item.id, rev: item.rev, fields: fields };
    return undefined;
  }, [item.id, item.rev]);
  return fresh;
}
