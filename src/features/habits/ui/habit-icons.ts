import { BookOpen, Brain, Droplet, Dumbbell, Footprints, Heart, Leaf, Moon, PenLine, RefreshCw, Sun, type LucideIcon } from "lucide-react";
import type { HabitIcon } from "@/data/domain";

/** Line icons a habit can wear (Habit sheet · Icon); no emoji. */
export const HABIT_ICONS: Record<HabitIcon, LucideIcon> = {
  book: BookOpen,
  sun: Sun,
  dumbbell: Dumbbell,
  droplet: Droplet,
  moon: Moon,
  footprints: Footprints,
  brain: Brain,
  pen: PenLine,
  heart: Heart,
  leaf: Leaf,
};

export const HABIT_ICON_IDS = Object.keys(HABIT_ICONS) as HabitIcon[];

export function habitIcon(icon: HabitIcon | undefined): LucideIcon {
  return icon ? HABIT_ICONS[icon] : RefreshCw;
}
