export const SUPPORTED_LOCALES = ["ko", "en", "ja"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type {
  AdventurerCardCharacter,
  AdventurerCardData,
  AdventurerCardDesign,
  AdventurerCardTemplate,
  CardRatio,
} from "@/components/cards/types";
