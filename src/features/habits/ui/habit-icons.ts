import { BookOpen, Briefcase, Droplet, Dumbbell, Flower2, GraduationCap, HeartPulse, Leaf, Moon, RefreshCw, Utensils, type LucideIcon } from "lucide-react";
import type { HabitIcon } from "@/data/domain";

/** Line icons for the contract's fixed habit icon identifiers (Habit sheet · Icon); no emoji, no other ids. */
export const HABIT_ICONS: Record<HabitIcon, LucideIcon> = {
  default: Leaf,
  water: Droplet,
  book: BookOpen,
  exercise: Dumbbell,
  sleep: Moon,
  food: Utensils,
  meditation: Flower2,
  study: GraduationCap,
  work: Briefcase,
  health: HeartPulse,
};

export const HABIT_ICON_IDS = Object.keys(HABIT_ICONS) as HabitIcon[];

export function habitIcon(icon: HabitIcon | undefined): LucideIcon {
  return icon ? HABIT_ICONS[icon] : RefreshCw;
}
