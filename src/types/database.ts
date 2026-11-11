/**
 * Database types generated from the linked Supabase schema, then cleaned up.
 * Regenerate with:
 * `npx supabase gen types typescript --db-url "$DIRECT_URL"`
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DocumentRole = "editor" | "viewer";

export type DocumentAccessRole = "owner" | DocumentRole;

/** Canonical empty Tiptap document. */
export const EMPTY_TIPTAP_DOC: Json = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type Database = {
  public: {
    Tables: {
      comment_threads: {
        Row: {
          id: string;
          document_id: string;
          author_id: string;
          author_full_name: string;
          body: string;
          selected_text_snapshot: string;
          anchor_start: string;
          anchor_end: string;
          anchor_status: string;
          resolved: boolean;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          document_id: string;
          author_id?: string;
          author_full_name?: string;
          body: string;
          selected_text_snapshot?: string;
          anchor_start: string;
          anchor_end: string;
          anchor_status?: string;
          resolved?: boolean;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          author_id?: string;
          author_full_name?: string;
          body?: string;
          selected_text_snapshot?: string;
          anchor_start?: string;
          anchor_end?: string;
          anchor_status?: string;
          resolved?: boolean;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comment_threads_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_threads_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comment_replies: {
        Row: {
          id: string;
          thread_id: string;
          author_id: string;
          author_full_name: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          thread_id: string;
          author_id?: string;
          author_full_name?: string;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          author_id?: string;
          author_full_name?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comment_replies_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "comment_threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comment_replies_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_suggestions: {
        Row: {
          id: string;
          document_id: string;
          author_id: string;
          author_full_name: string;
          suggestion_type: string;
          original_text: string;
          proposed_content: Json;
          anchor_start: string;
          anchor_end: string;
          status: string;
          application_id: string | null;
          claim_expires_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          conflict_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          document_id: string;
          author_id?: string;
          author_full_name?: string;
          suggestion_type: string;
          original_text?: string;
          proposed_content?: Json;
          anchor_start: string;
          anchor_end: string;
          status?: string;
          application_id?: string | null;
          claim_expires_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          conflict_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          author_id?: string;
          author_full_name?: string;
          suggestion_type?: string;
          original_text?: string;
          proposed_content?: Json;
          anchor_start?: string;
          anchor_end?: string;
          status?: string;
          application_id?: string | null;
          claim_expires_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          conflict_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_suggestions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_suggestions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_yjs_states: {
        Row: {
          document_id: string;
          yjs_state: string;
          content_json: Json | null;
          migrated_from_json_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          document_id: string;
          yjs_state: string;
          content_json?: Json | null;
          migrated_from_json_at?: string | null;
          updated_at?: string;
        };
        Update: {
          document_id?: string;
          yjs_state?: string;
          content_json?: Json | null;
          migrated_from_json_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_yjs_states_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_members: {
        Row: {
          created_at: string;
          document_id: string;
          id: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_id: string;
          id?: string;
          role: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_members_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          id: string;
          owner_id: string;
          revision: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          content?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          owner_id: string;
          revision?: number;
          title?: string;
          updated_at?: string;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          owner_id?: string;
          revision?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_edit_document: {
        Args: { p_document_id: string };
        Returns: boolean;
      };
      claim_document_suggestion_for_accept: {
        Args: { p_suggestion_id: string };
        Returns: Database["public"]["Tables"]["document_suggestions"]["Row"][];
      };
      complete_document_suggestion_accept: {
        Args: { p_suggestion_id: string; p_application_id: string };
        Returns: Database["public"]["Tables"]["document_suggestions"]["Row"][];
      };
      fail_document_suggestion_accept: {
        Args: {
          p_suggestion_id: string;
          p_application_id: string;
          p_conflict_reason: string;
        };
        Returns: Database["public"]["Tables"]["document_suggestions"]["Row"][];
      };
      get_document_yjs_state: {
        Args: { p_document_id: string };
        Returns: string;
      };
      has_document_access: {
        Args: { p_document_id: string };
        Returns: boolean;
      };
      initialize_document_yjs_state: {
        Args: {
          p_document_id: string;
          p_yjs_state: string;
          p_content_json?: Json | null;
        };
        Returns: string;
      };
      is_document_owner: {
        Args: { p_document_id: string };
        Returns: boolean;
      };
      list_document_collaborators: {
        Args: { p_document_id: string };
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          member_id: string;
          role: string;
          user_id: string;
        }[];
      };
      reject_document_suggestion: {
        Args: { p_suggestion_id: string };
        Returns: Database["public"]["Tables"]["document_suggestions"]["Row"][];
      };
      release_stale_suggestion_claim: {
        Args: { p_suggestion_id: string };
        Returns: Database["public"]["Tables"]["document_suggestions"]["Row"][];
      };
      remove_document_member: {
        Args: { p_member_id: string };
        Returns: undefined;
      };
      share_document_by_email: {
        Args: {
          p_document_id: string;
          p_email: string;
          p_role: string;
        };
        Returns: {
          email: string;
          full_name: string;
          member_id: string;
          role: string;
          user_id: string;
        }[];
      };
      store_document_yjs_state: {
        Args: {
          p_document_id: string;
          p_yjs_state: string;
          p_content_json?: Json | null;
        };
        Returns: undefined;
      };
      update_document_member_role: {
        Args: {
          p_member_id: string;
          p_role: string;
        };
        Returns: {
          email: string;
          full_name: string;
          member_id: string;
          role: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Document = Database["public"]["Tables"]["documents"]["Row"];
export type DocumentMember =
  Database["public"]["Tables"]["document_members"]["Row"];

export type Collaborator = {
  member_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: DocumentRole;
  created_at?: string;
};
