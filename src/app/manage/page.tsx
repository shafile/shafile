import type { Metadata } from "next";
import { ManageList } from "@/components/manage/manage-list";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ManagePage() {
  return <ManageList />;
}
