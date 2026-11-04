import { BookOpenText, CalendarDays, CupSoda, Gift, HardHat, Package, PenLine, Shirt, Tags, Umbrella } from "lucide-react";

export function getMaterialIcon(material) {
    const name = material.name.toLowerCase();
    const category = material.category.toLowerCase();
    if (name.includes("kit")) return Gift;
    if (name.includes("bottle")) return CupSoda;
    if (name.includes("cap")) return HardHat;
    if (/key[\s-]?chain/.test(name) || category === "accessories") return Tags;
    if (name.includes("brochure") || category === "printed materials") return BookOpenText;
    if (name.includes("umbrella") || category === "utility items") return Umbrella;
    if (name.includes("pen") || category === "stationery") return PenLine;
    if (name.includes("calendar")) return CalendarDays;
    if (name.includes("shirt") || category === "apparel") return Shirt;
    return Package;
}
