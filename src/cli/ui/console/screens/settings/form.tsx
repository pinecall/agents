/** The whole set on one form, a section at a time: what hears, decides and speaks, the conversation, the memory, what is known by heart, the bases. */

import { useState, type FormEvent, type ReactNode } from "react";

import type { KnowledgeBase, TuningBody } from "@pinecall/protocol";

import type { Provider } from "../../lib/catalogue";
import { Button, Input, Tabs } from "../../ui";
import { BasesSection } from "./bases";
import { ConversationSection } from "./conversation";
import { CURATED, StageSection, VoiceField } from "./stages";
import { configOf, typedOf, type Typed } from "./typed";
import { KnowledgeSection, MemorySection } from "./words";

export type Section = "hears" | "decides" | "speaks" | "conversation" | "memory" | "knowledge" | "bases";

const SECTIONS: readonly { tab: Section; name: string }[] = [
  { tab: "hears", name: "STT" },
  { tab: "decides", name: "LLM" },
  { tab: "speaks", name: "Voice" },
  { tab: "conversation", name: "Conversation" },
  { tab: "memory", name: "Memory" },
  { tab: "knowledge", name: "Knowledge" },
  { tab: "bases", name: "Bases" },
];

// A key that opens words and not the pipeline sets the opening, what is remembered and what is
// known by heart, and sees nothing else: the vendors are not its to move.
const WORDS: readonly Section[] = ["conversation", "memory", "knowledge"];

/** The sections a key may edit, in reading order. */
export function sectionsFor(wordsOnly: boolean): readonly { tab: Section; name: string }[] {
  return wordsOnly ? SECTIONS.filter((one) => WORDS.includes(one.tab)) : SECTIONS;
}

export function SettingsForm({
  standing,
  version,
  wordsOnly,
  voices,
  providers,
  defaults,
  models,
  bases,
  section,
  onPickSection,
  saving,
  error,
  onSave,
}: {
  standing: TuningBody;
  /** The version this form was opened at: what the save is checked against. */
  version: number | null;
  wordsOnly: boolean;
  voices: readonly string[];
  providers: readonly Provider[];
  defaults: Readonly<Record<string, string>>;
  models: Readonly<Record<string, readonly string[]>>;
  /** Every base pushed in this world, for the Bases section to pick from; null while asked. */
  bases: readonly KnowledgeBase[] | null;
  section: Section;
  onPickSection: (section: Section) => void;
  saving: boolean;
  error: string | null;
  onSave: (config: TuningBody, ifVersion: number | null, note: string | null) => Promise<void>;
}): ReactNode {
  const vendors = new Set(providers.map((one) => one.name));
  const [typed, setTyped] = useState<Typed>(() => typedOf(standing, vendors));
  const [saved, setSaved] = useState(false);
  const change = (field: keyof Typed, value: string): void => {
    setSaved(false);
    setTyped({ ...typed, [field]: value });
  };
  const knob = (field: "stt" | "llm" | "tts") => (picked: Typed["stt"]) => {
    setSaved(false);
    // A voice is one vendor's: moving the speaking vendor takes the voice with it.
    setTyped(field === "tts" && picked.vendor !== typed.tts.vendor ? { ...typed, tts: picked, voice: "" } : { ...typed, [field]: picked });
  };
  const speaking = typed.tts.vendor === "" ? (defaults["tts"] ?? CURATED) : typed.tts.vendor;

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await onSave(configOf(typed, wordsOnly, standing), version, typed.note.trim() === "" ? null : typed.note.trim());
    setSaved(true);
  };

  return (
    <form className="ui-card set-form" onSubmit={(event) => void save(event)}>
      <div className="set-tabs">
        <Tabs label="Settings" tabs={sectionsFor(wordsOnly)} on={section} onPick={onPickSection} />
      </div>
      {section === "hears" && (
        <StageSection modality="stt" title="Speech to text" blurb="What turns the caller's voice into words." knob={typed.stt} providers={providers} defaults={defaults} models={models} onChange={knob("stt")} />
      )}
      {section === "decides" && (
        <StageSection modality="llm" title="Language model" blurb="The model that reads what the caller said and writes the answer." knob={typed.llm} providers={providers} defaults={defaults} models={models} onChange={knob("llm")} />
      )}
      {section === "speaks" && (
        <StageSection modality="tts" title="Voice" blurb="What says the answer out loud, and in which voice." knob={typed.tts} providers={providers} defaults={defaults} models={models} onChange={knob("tts")}>
          <VoiceField vendor={speaking} voice={typed.voice} voices={voices} onChange={(voice) => change("voice", voice)} />
        </StageSection>
      )}
      {section === "conversation" && <ConversationSection typed={typed} wordsOnly={wordsOnly} change={change} />}
      {section === "memory" && <MemorySection typed={typed} change={change} />}
      {section === "knowledge" && <KnowledgeSection typed={typed} change={change} />}
      {section === "bases" && (
        <BasesSection
          rows={typed.bases}
          offered={bases}
          onChange={(rows) => {
            setSaved(false);
            setTyped({ ...typed, bases: rows });
          }}
        />
      )}
      <div className="set-save">
        <Input className="set-save-note" value={typed.note} placeholder="Why, for the history (optional)" onChange={(event) => change("note", event.target.value)} />
        <Button kind="primary" size="form" type="submit" disabled={saving}>
          {saving ? "Saving…" : version === null ? "Save as the first version" : `Save as v${version + 1}`}
        </Button>
        <span className={error !== null ? "set-save-said set-save-error" : "set-save-said"}>
          {error !== null ? error : saved ? "Kept. The next call runs on it." : "Every section is saved together, as one version. An empty field is the runtime's default."}
        </span>
      </div>
    </form>
  );
}
