import HomePage from "@/components/home/home-page";
import type { Metadata } from "next";
import { preload } from "react-dom";

export const metadata: Metadata = {
  title: "XIV Adventurer Card | Your adventure, worth keeping",
  description: "Create an adventurer card from your FINAL FANTASY XIV screenshot. Explore Cinematic, Editorial and Identity designs, then download your finished card.",
  openGraph: { title: "XIV Adventurer Card", description: "Your FFXIV screenshot, made into an adventurer card.", type: "website" },
};

export default function Page() {
  preload("/assets/samples/coner/optimized/landscape.webp", { as: "image", fetchPriority: "high" });
  return <HomePage />;
}

