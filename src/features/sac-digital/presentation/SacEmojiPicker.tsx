import { useMemo, useState } from "react";
import { Search } from "lucide-react";

/** Emoji picker local ao SAC: nenhuma dependência externa ou chamada de API. */
const CATEGORIES = [
  {
    id: "faces", title: "Rostos e emoções", icon: "😀",
    entries: [
      ["😀", "sorriso feliz"], ["😃", "feliz alegre"], ["😄", "sorridente"], ["😁", "dentes sorriso"],
      ["😆", "risada"], ["😅", "suor sorriso"], ["😂", "rindo lágrimas"], ["🤣", "gargalhada"],
      ["😊", "carinha feliz"], ["🥰", "apaixonado corações"], ["😍", "amor olhos coração"], ["😘", "beijo"],
      ["😋", "delicioso língua"], ["😎", "óculos escuros"], ["🥳", "festa comemorar"], ["🤩", "maravilhado"],
      ["🙂", "leve sorriso"], ["😉", "piscadinha"], ["🤔", "pensando"], ["🫣", "espiando"],
      ["😐", "neutro"], ["😕", "confuso"], ["😔", "triste"], ["😢", "chorando"],
      ["😭", "muito triste choro"], ["😤", "irritado"], ["😡", "bravo raiva"], ["🥹", "emocionado"],
      ["😴", "dormindo"], ["😷", "máscara"], ["🤗", "abraço"], ["🫡", "saudação respeito"],
    ],
  },
  {
    id: "gestures", title: "Gestos e pessoas", icon: "👋",
    entries: [
      ["👍", "joinha positivo"], ["👎", "negativo"], ["👌", "ok"], ["👏", "palmas aplausos"],
      ["🙌", "celebrar"], ["🙏", "obrigado por favor"], ["🤝", "aperto de mão acordo"], ["💪", "força"],
      ["👋", "olá tchau"], ["🤞", "torcendo sorte"], ["✌️", "paz vitória"], ["🫶", "coração mãos"],
      ["👀", "olhos"], ["🧠", "cérebro"], ["👨‍💻", "trabalho computador"], ["👩‍💻", "trabalho tecnologia"],
      ["🧑‍🔧", "técnico manutenção"], ["👨‍🔧", "técnico"], ["👩‍🔧", "técnica"], ["🙋", "pessoa levantando mão"],
    ],
  },
  {
    id: "hearts", title: "Corações e símbolos", icon: "❤️",
    entries: [
      ["❤️", "coração vermelho amor"], ["🩷", "coração rosa"], ["🧡", "coração laranja"],
      ["💛", "coração amarelo"], ["💚", "coração verde"], ["💙", "coração azul"],
      ["💜", "coração roxo"], ["🖤", "coração preto"], ["🤍", "coração branco"],
      ["💔", "coração partido"], ["💯", "cem nota máxima"], ["✅", "confirmado certo aprovado"],
      ["✔️", "correto"], ["❌", "errado não"], ["❗", "atenção exclamação"], ["❓", "pergunta dúvida"],
      ["⭐", "estrela"], ["✨", "brilho"], ["🔥", "fogo"], ["💬", "conversa mensagem"],
      ["🔔", "sino notificação"], ["🎉", "festa"], ["🎊", "confete"], ["💤", "sono"],
    ],
  },
  {
    id: "animals", title: "Animais e natureza", icon: "🌿",
    entries: [
      ["🐶", "cachorro cão"], ["🐱", "gato"], ["🐭", "rato"], ["🐰", "coelho"],
      ["🦊", "raposa"], ["🐼", "panda"], ["🦁", "leão"], ["🐸", "sapo"],
      ["🐵", "macaco"], ["🐔", "galinha"], ["🐦", "pássaro"], ["🦋", "borboleta"],
      ["🌷", "flor tulipa"], ["🌻", "girassol"], ["🌹", "rosa flor"], ["🌴", "palmeira"],
      ["🌿", "folhas natureza"], ["🌈", "arco íris"], ["☀️", "sol"], ["🌙", "lua"],
      ["☁️", "nuvem"], ["🌧️", "chuva"], ["❄️", "neve"], ["🌊", "onda mar"],
    ],
  },
  {
    id: "food", title: "Comidas e bebidas", icon: "🍕",
    entries: [
      ["🍎", "maçã"], ["🍌", "banana"], ["🍓", "morango"], ["🍉", "melancia"],
      ["🍇", "uva"], ["🥑", "abacate"], ["🍕", "pizza"], ["🍔", "hambúrguer"],
      ["🍟", "batata frita"], ["🌮", "taco"], ["🍝", "macarrão"], ["🍣", "sushi"],
      ["🍰", "bolo"], ["🎂", "aniversário bolo"], ["🍫", "chocolate"], ["🍩", "rosquinha"],
      ["🍿", "pipoca"], ["☕", "café"], ["🍵", "chá"], ["🥤", "refrigerante"],
    ],
  },
  {
    id: "travel", title: "Lugares e viagens", icon: "🚗",
    entries: [
      ["🚗", "carro veículo"], ["🚕", "táxi"], ["🚌", "ônibus"], ["🏍️", "moto"],
      ["🚲", "bicicleta"], ["✈️", "avião"], ["🚀", "foguete"], ["🚢", "navio"],
      ["🏠", "casa"], ["🏢", "empresa prédio"], ["🏪", "loja"], ["🏥", "hospital"],
      ["🏖️", "praia"], ["⛰️", "montanha"], ["🌎", "mundo terra"], ["📍", "localização"],
      ["🗺️", "mapa"], ["🧭", "bússola"], ["🚦", "semáforo"], ["🛣️", "estrada"],
    ],
  },
  {
    id: "items", title: "Objetos e tecnologia", icon: "📱",
    entries: [
      ["📱", "celular telefone"], ["💻", "notebook computador"], ["🖥️", "monitor"],
      ["🖨️", "impressora"], ["⌨️", "teclado"], ["🖱️", "mouse"],
      ["📷", "câmera"], ["🎧", "fone ouvido"], ["📺", "televisão tv"],
      ["🔌", "tomada energia"], ["🔋", "bateria"], ["💡", "lâmpada ideia"],
      ["🛠️", "ferramentas assistência"], ["🔧", "chave inglesa"], ["⚙️", "engrenagem"],
      ["📦", "pacote produto"], ["📄", "documento"], ["📎", "anexo clipe"],
      ["📝", "anotação"], ["📆", "calendário"], ["⏰", "relógio"], ["💰", "dinheiro"],
      ["💳", "cartão pagamento"], ["🎁", "presente"],
    ],
  },
  {
    id: "flags", title: "Bandeiras", icon: "🇧🇷",
    entries: [
      ["🇧🇷", "brasil"], ["🇵🇹", "portugal"], ["🇺🇸", "estados unidos"],
      ["🇦🇷", "argentina"], ["🇲🇽", "méxico"], ["🇨🇦", "canadá"],
      ["🇪🇸", "espanha"], ["🇫🇷", "frança"], ["🇩🇪", "alemanha"],
      ["🇮🇹", "itália"], ["🇯🇵", "japão"], ["🇨🇳", "china"],
    ],
  },
] as const;

const normalizeSearch = (value: string) => value.toLocaleLowerCase("pt-BR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function SacEmojiPicker({
  recentEmojis,
  onSelect,
}: {
  recentEmojis: string[];
  onSelect: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("faces");
  const term = normalizeSearch(query.trim());
  const sections = useMemo(() => {
    if (term) {
      return CATEGORIES.map(category => ({
        title: category.title,
        entries: category.entries.filter(([emoji, description]) =>
          normalizeSearch(description).includes(term) || emoji.includes(term)),
      })).filter(category => category.entries.length > 0);
    }
    if (activeCategory === "recent") {
      const allEntries = CATEGORIES.flatMap(category => category.entries);
      return [{
        title: "Usados recentemente",
        entries: recentEmojis.flatMap(emoji => {
          const match = allEntries.find(([symbol]) => symbol === emoji);
          return match ? [match] : [];
        }),
      }];
    }
    return CATEGORIES.filter(category => category.id === activeCategory)
      .map(category => ({ title: category.title, entries: [...category.entries] }));
  }, [activeCategory, recentEmojis, term]);

  return (
    <div role="dialog" aria-label="Selecionar emoji"
      className="absolute bottom-[calc(100%+12px)] left-[-48px] z-40 flex h-[340px] w-[min(86vw,352px)] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search size={17} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          aria-label="Buscar emoji"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Buscar emoji"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 py-2" role="group" aria-label="Categorias de emojis">
        {recentEmojis.length > 0 && (
          <button type="button" aria-label="Emojis recentes" title="Recentes"
            aria-pressed={!term && activeCategory === "recent"}
            className={`flex h-9 min-w-9 items-center justify-center rounded-lg text-lg hover:bg-muted ${!term && activeCategory === "recent" ? "bg-primary-soft" : ""}`}
            onClick={() => {setQuery("");setActiveCategory("recent");}}>🕘</button>
        )}
        {CATEGORIES.map(category => (
          <button key={category.id} type="button" title={category.title}
            aria-label={category.title} aria-pressed={!term && activeCategory === category.id}
            className={`flex h-9 min-w-9 items-center justify-center rounded-lg text-lg hover:bg-muted ${!term && activeCategory === category.id ? "bg-primary-soft" : ""}`}
            onClick={() => {setQuery("");setActiveCategory(category.id);}}>{category.icon}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {sections.length === 0 || sections.every(section => section.entries.length === 0) ? (
          <p className="py-9 text-center text-sm text-muted-foreground">Nenhum emoji encontrado.</p>
        ) : sections.map(section => (
          <section key={section.title}>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{section.title}</p>
            <div className="mb-4 grid grid-cols-8 gap-1">
              {section.entries.map(([emoji, description]) => (
                <button type="button" key={emoji} title={description || emoji}
                  aria-label={description || emoji}
                  className="flex h-9 w-full items-center justify-center rounded-lg text-[22px] leading-none transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => onSelect(emoji)}>{emoji}</button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
