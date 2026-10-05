// Dibuat otomatis dari skema Supabase (supabase/migrations). Jangan diedit manual.
// Regenerasi: minta Claude menjalankan generate_typescript_types, atau `bunx supabase gen types typescript --project-id kmytmtqidmnxtdmrmyfs`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      admin_emails: {
        Row: {
          email: string;
        };
        Insert: {
          email: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      countries: {
        Row: {
          code: string;
          currency: string | null;
          flag: string;
          name_en: string;
          name_id: string;
          region: string;
        };
        Insert: {
          code: string;
          currency?: string | null;
          flag: string;
          name_en: string;
          name_id: string;
          region: string;
        };
        Update: {
          code?: string;
          currency?: string | null;
          flag?: string;
          name_en?: string;
          name_id?: string;
          region?: string;
        };
        Relationships: [];
      };
      document_types: {
        Row: {
          category: string;
          code: string;
          description: string | null;
          guide_url: string | null;
          has_expiry: boolean;
          is_sensitive: boolean;
          name: string;
          sort_order: number;
        };
        Insert: {
          category: string;
          code: string;
          description?: string | null;
          guide_url?: string | null;
          has_expiry?: boolean;
          is_sensitive?: boolean;
          name: string;
          sort_order?: number;
        };
        Update: {
          category?: string;
          code?: string;
          description?: string | null;
          guide_url?: string | null;
          has_expiry?: boolean;
          is_sensitive?: boolean;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          birth_date: string | null;
          city: string | null;
          created_at: string;
          education_level: string | null;
          english_level: string | null;
          field_of_study: string | null;
          full_name: string | null;
          id: string;
          onboarding_completed: boolean;
          target_countries: string[];
          target_departure: string | null;
          target_tracks: Database["public"]["Enums"]["track"][];
          updated_at: string;
          years_experience: number | null;
        };
        Insert: {
          birth_date?: string | null;
          city?: string | null;
          created_at?: string;
          education_level?: string | null;
          english_level?: string | null;
          field_of_study?: string | null;
          full_name?: string | null;
          id: string;
          onboarding_completed?: boolean;
          target_countries?: string[];
          target_departure?: string | null;
          target_tracks?: Database["public"]["Enums"]["track"][];
          updated_at?: string;
          years_experience?: number | null;
        };
        Update: {
          birth_date?: string | null;
          city?: string | null;
          created_at?: string;
          education_level?: string | null;
          english_level?: string | null;
          field_of_study?: string | null;
          full_name?: string | null;
          id?: string;
          onboarding_completed?: boolean;
          target_countries?: string[];
          target_departure?: string | null;
          target_tracks?: Database["public"]["Enums"]["track"][];
          updated_at?: string;
          years_experience?: number | null;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          attribution: string | null;
          authority: Database["public"]["Enums"]["source_authority"];
          base_url: string;
          config: Json;
          country_code: string | null;
          created_at: string;
          failure_count: number;
          id: string;
          kind: Database["public"]["Enums"]["source_kind"];
          last_run_at: string | null;
          last_success_at: string | null;
          name: string;
          next_run_at: string | null;
          schedule: string;
          slug: string;
          status: Database["public"]["Enums"]["source_status"];
          terms_note: string | null;
          tracks: Database["public"]["Enums"]["track"][];
          trust_score: number;
          updated_at: string;
        };
        Insert: {
          attribution?: string | null;
          authority: Database["public"]["Enums"]["source_authority"];
          base_url: string;
          config?: Json;
          country_code?: string | null;
          created_at?: string;
          failure_count?: number;
          id?: string;
          kind: Database["public"]["Enums"]["source_kind"];
          last_run_at?: string | null;
          last_success_at?: string | null;
          name: string;
          next_run_at?: string | null;
          schedule?: string;
          slug: string;
          status?: Database["public"]["Enums"]["source_status"];
          terms_note?: string | null;
          tracks?: Database["public"]["Enums"]["track"][];
          trust_score: number;
          updated_at?: string;
        };
        Update: {
          attribution?: string | null;
          authority?: Database["public"]["Enums"]["source_authority"];
          base_url?: string;
          config?: Json;
          country_code?: string | null;
          created_at?: string;
          failure_count?: number;
          id?: string;
          kind?: Database["public"]["Enums"]["source_kind"];
          last_run_at?: string | null;
          last_success_at?: string | null;
          name?: string;
          next_run_at?: string | null;
          schedule?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["source_status"];
          terms_note?: string | null;
          tracks?: Database["public"]["Enums"]["track"][];
          trust_score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sources_country_code_fkey";
            columns: ["country_code"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["code"];
          },
        ];
      };
      tracks: {
        Row: {
          code: Database["public"]["Enums"]["track"];
          description: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          code: Database["public"]["Enums"]["track"];
          description: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          code?: Database["public"]["Enums"]["track"];
          description?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      source_authority:
        | "government"
        | "institution"
        | "employer"
        | "aggregator"
        | "community";
      source_kind:
        | "api"
        | "ats"
        | "jsonld"
        | "csv"
        | "monitor"
        | "manual"
        | "deeplink";
      source_status: "active" | "paused" | "failing" | "draft";
      track: "whv_au" | "dama_au" | "professional" | "overseas" | "scholarship";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends {
  Row: infer R;
}
  ? R
  : never;

export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never;

export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never;

export type Enums<EnumName extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][EnumName];

export const Constants = {
  public: {
    Enums: {
      source_authority: [
        "government",
        "institution",
        "employer",
        "aggregator",
        "community",
      ],
      source_kind: [
        "api",
        "ats",
        "jsonld",
        "csv",
        "monitor",
        "manual",
        "deeplink",
      ],
      source_status: ["active", "paused", "failing", "draft"],
      track: ["whv_au", "dama_au", "professional", "overseas", "scholarship"],
    },
  },
} as const;
