export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      call_events: {
        Row: {
          at: string
          call_run_id: string
          detail: Json | null
          id: number
          kind: string
        }
        Insert: {
          at?: string
          call_run_id: string
          detail?: Json | null
          id?: number
          kind: string
        }
        Update: {
          at?: string
          call_run_id?: string
          detail?: Json | null
          id?: number
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_run_id_fkey"
            columns: ["call_run_id"]
            isOneToOne: false
            referencedRelation: "call_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      call_runs: {
        Row: {
          billable: boolean
          briefing: Json | null
          calle_call_id: string | null
          calle_confidence: Json | null
          calle_failure: Json | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          disposition: string | null
          dry_run: boolean
          id: string
          idempotency_key: string
          local_date: string
          mood: string | null
          part_of_day: string
          poll_after: string | null
          scheduled_for: string
          slot_id: string | null
          state: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          briefing?: Json | null
          calle_call_id?: string | null
          calle_confidence?: Json | null
          calle_failure?: Json | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          disposition?: string | null
          dry_run?: boolean
          id?: string
          idempotency_key: string
          local_date: string
          mood?: string | null
          part_of_day: string
          poll_after?: string | null
          scheduled_for: string
          slot_id?: string | null
          state?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          briefing?: Json | null
          calle_call_id?: string | null
          calle_confidence?: Json | null
          calle_failure?: Json | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          disposition?: string | null
          dry_run?: boolean
          id?: string
          idempotency_key?: string
          local_date?: string
          mood?: string | null
          part_of_day?: string
          poll_after?: string | null
          scheduled_for?: string
          slot_id?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_runs_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          call_run_id: string | null
          created_at: string
          due: string | null
          evidence_offset_seconds: number
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          call_run_id?: string | null
          created_at?: string
          due?: string | null
          evidence_offset_seconds: number
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          call_run_id?: string | null
          created_at?: string
          due?: string | null
          evidence_offset_seconds?: number
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_call_run_id_fkey"
            columns: ["call_run_id"]
            isOneToOne: false
            referencedRelation: "call_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          granted_at: string
          id: string
          kind: string
          revoked_at: string | null
          source: string
          text_version: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          kind: string
          revoked_at?: string | null
          source: string
          text_version: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          kind?: string
          revoked_at?: string | null
          source?: string
          text_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          call_run_id: string | null
          channel: string
          error: string | null
          id: string
          kind: string
          payload: Json
          sent_at: string | null
          user_id: string
        }
        Insert: {
          call_run_id?: string | null
          channel: string
          error?: string | null
          id?: string
          kind: string
          payload: Json
          sent_at?: string | null
          user_id: string
        }
        Update: {
          call_run_id?: string | null
          channel?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_call_run_id_fkey"
            columns: ["call_run_id"]
            isOneToOne: false
            referencedRelation: "call_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_mentions: {
        Row: {
          call_run_id: string | null
          created_at: string
          id: number
          item_id: string
          offset_seconds: number | null
        }
        Insert: {
          call_run_id?: string | null
          created_at?: string
          id?: number
          item_id: string
          offset_seconds?: number | null
        }
        Update: {
          call_run_id?: string | null
          created_at?: string
          id?: number
          item_id?: string
          offset_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_mentions_call_run_id_fkey"
            columns: ["call_run_id"]
            isOneToOne: false
            referencedRelation: "call_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_mentions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          retired_at: string | null
          retired_reason: string | null
          seeded: boolean
          since_date: string | null
          source: string
          status: string
          text: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          retired_at?: string | null
          retired_reason?: string | null
          seeded?: boolean
          since_date?: string | null
          source: string
          status?: string
          text: string
          user_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          retired_at?: string | null
          retired_reason?: string | null
          seeded?: boolean
          since_date?: string | null
          source?: string
          status?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pattern_reports: {
        Row: {
          created_at: string
          facts: Json
          id: string
          period_end: string
          period_start: string
          prose: string
          user_id: string
        }
        Insert: {
          created_at?: string
          facts: Json
          id?: string
          period_end: string
          period_start: string
          prose: string
          user_id: string
        }
        Update: {
          created_at?: string
          facts?: Json
          id?: string
          period_end?: string
          period_start?: string
          prose?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pattern_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email_receipts: boolean
          id: string
          phone_confirmed_at: string | null
          phone_e164: string | null
          telegram_chat_id: number | null
          telegram_receipts: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email_receipts?: boolean
          id: string
          phone_confirmed_at?: string | null
          phone_e164?: string | null
          telegram_chat_id?: number | null
          telegram_receipts?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email_receipts?: boolean
          id?: string
          phone_confirmed_at?: string | null
          phone_e164?: string | null
          telegram_chat_id?: number | null
          telegram_receipts?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      results: {
        Row: {
          call_run_id: string
          error: string | null
          fetched_at: string
          structured: Json | null
          valid: boolean
        }
        Insert: {
          call_run_id: string
          error?: string | null
          fetched_at?: string
          structured?: Json | null
          valid: boolean
        }
        Update: {
          call_run_id?: string
          error?: string | null
          fetched_at?: string
          structured?: Json | null
          valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "results_call_run_id_fkey"
            columns: ["call_run_id"]
            isOneToOne: true
            referencedRelation: "call_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      slots: {
        Row: {
          active: boolean
          created_at: string
          id: string
          local_time: string
          part_of_day: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          local_time: string
          part_of_day: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          local_time?: string
          part_of_day?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "slots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          token_hash: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          call_run_id: string
          fetched_at: string
          raw: Json | null
          turns: Json
        }
        Insert: {
          call_run_id: string
          fetched_at?: string
          raw?: Json | null
          turns: Json
        }
        Update: {
          call_run_id?: string
          fetched_at?: string
          raw?: Json | null
          turns?: Json
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_call_run_id_fkey"
            columns: ["call_run_id"]
            isOneToOne: true
            referencedRelation: "call_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          received_at: string
          type: string | null
        }
        Insert: {
          event_id: string
          received_at?: string
          type?: string | null
        }
        Update: {
          event_id?: string
          received_at?: string
          type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
