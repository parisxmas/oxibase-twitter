"use client";

// A small emoji panel, hand-rolled on purpose: an off-the-shelf picker would be
// larger than the rest of this app's JavaScript, and all that is needed here is
// "show a grid, hand one back". Insertion is the caller's job — only it knows
// where the caret is.

import { useEffect, useRef } from "react";

/** Grouped rather than searchable: with no keyword data, headings beat a box
 *  that matches nothing. */
const GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["Smileys", ["😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥲", "😍", "🤩", "😘", "😋", "😜", "🤪", "🤗", "🤔", "🤨", "😐", "😴", "🥳", "😎", "🤓", "🧐", "😳", "🥺", "😢", "😭", "😤", "😡", "🤯", "😬", "🫠", "🤐", "🤫", "🙄"]],
  ["Gestures", ["👍", "👎", "👌", "🤌", "✌️", "🤞", "🫰", "🤟", "🤙", "👏", "🙌", "🫶", "🙏", "💪", "🖐️", "✋", "👋", "🤝", "☝️", "👇", "👉", "👈", "🫡", "🤷", "🤦", "💅", "🖖", "✍️"]],
  ["Hearts", ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"]],
  ["Animals & nature", ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉", "🦄", "🐝", "🐛", "🦋", "🐌", "🐢", "🐍", "🐙", "🦀", "🐬", "🐳", "🐟", "🌱", "🌲", "🌳", "🌵", "🌸", "🌼", "🌻", "🍀", "🌈", "☀️", "🌤️", "☁️", "🌧️", "⛈️", "❄️", "🔥", "🌊", "🌙", "⭐", "✨", "⚡", "🌍"]],
  ["Food & drink", ["☕", "🍵", "🧉", "🥤", "🍺", "🍻", "🥂", "🍷", "🥃", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒", "🥝", "🍅", "🥑", "🥦", "🌽", "🥖", "🧇", "🍕", "🍔", "🌮", "🌯", "🍣", "🍜", "🍝", "🍦", "🍩", "🍪", "🎂", "🍫", "🍿", "🧂", "🍽️"]],
  ["Activity & travel", ["⚽", "🏀", "🏈", "🎾", "🏐", "🏓", "🥊", "🏃", "🚴", "🧘", "🏊", "⛰️", "🏕️", "🏖️", "✈️", "🚀", "🛰️", "🚗", "🚕", "🚌", "🚲", "🛴", "🚂", "⛵", "🗺️", "🧭", "🎪", "🎨", "🎬", "🎤", "🎧", "🎸", "🥁", "🎹", "🎲", "🎯", "🏆", "🥇", "🎉", "🎊"]],
  ["Work & objects", ["💻", "🖥️", "⌨️", "🖱️", "💾", "💿", "🖨️", "📱", "☎️", "📷", "🎥", "🔋", "🔌", "💡", "🔍", "🔎", "🔧", "🔨", "🛠️", "⚙️", "🧪", "🧬", "🔬", "🧲", "📦", "📚", "📖", "📝", "✏️", "📌", "📎", "🗂️", "📅", "📊", "📈", "📉", "🗑️", "🔒", "🔑", "🕰️"]],
  ["Symbols", ["✅", "❌", "⚠️", "🚫", "❓", "❗", "💯", "🔥", "⭐", "🌟", "💫", "🎈", "🏁", "🚩", "♻️", "🔄", "⬆️", "⬇️", "➡️", "⬅️", "🔗", "©️", "™️", "🆗", "🆕", "🔺", "🔵", "⚫", "⚪", "🟢", "🟡", "🔴", "🟣", "🟠", "🧿", "☑️", "〰️", "➕", "➖", "➗"]],
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  /** Called with the character; the panel stays open so several can be added. */
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  // Dismiss the way a popover should: a click anywhere else, or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="emoji-panel" ref={wrap} role="dialog" aria-label="Emoji">
      {GROUPS.map(([name, emojis]) => (
        <div key={name}>
          <h4>{name}</h4>
          <div className="emoji-grid">
            {emojis.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={e}
                title={e}
                // The textarea must not lose the caret, or there is nowhere to
                // insert: mousedown is where focus would move, so refuse it there.
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => onPick(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
