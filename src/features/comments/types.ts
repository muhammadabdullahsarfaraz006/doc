export type CommentAnchorStatus = "active" | "orphaned";

export type CommentThread = {
  id: string;
  document_id: string;
  author_id: string;
  author_full_name: string;
  body: string;
  selected_text_snapshot: string;
  anchor_start: string;
  anchor_end: string;
  anchor_status: CommentAnchorStatus;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentReply = {
  id: string;
  thread_id: string;
  author_id: string;
  author_full_name: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type SuggestionType = "insertion" | "deletion" | "replacement";
export type SuggestionStatus =
  | "pending"
  | "applying"
  | "accepted"
  | "rejected"
  | "conflict";

export type DocumentSuggestion = {
  id: string;
  document_id: string;
  author_id: string;
  author_full_name: string;
  suggestion_type: SuggestionType;
  original_text: string;
  proposed_content: { text?: string };
  anchor_start: string;
  anchor_end: string;
  status: SuggestionStatus;
  application_id: string | null;
  claim_expires_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  conflict_reason: string | null;
  created_at: string;
  updated_at: string;
};
