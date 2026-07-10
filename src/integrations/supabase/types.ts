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
  public: {
    Tables: {
      belief_stats: {
        Row: {
          belief_id: number
          buy_velocity_15m: number
          buy_velocity_baseline: number
          buy_volume_1h_usd: number
          buy_volume_24h_usd: number
          buy_volume_30d_usd: number
          buy_volume_7d_usd: number
          computed_at: string
          delta_conviction_1h: number | null
          distribution_gini: number | null
          ignition_score: number | null
          lifecycle_since: string
          lifecycle_stage: string
          momentum: number | null
          split_pct: number | null
          unique_wallets_24h: number
          whale_activity_pct: number | null
        }
        Insert: {
          belief_id: number
          buy_velocity_15m?: number
          buy_velocity_baseline?: number
          buy_volume_1h_usd?: number
          buy_volume_24h_usd?: number
          buy_volume_30d_usd?: number
          buy_volume_7d_usd?: number
          computed_at: string
          delta_conviction_1h?: number | null
          distribution_gini?: number | null
          ignition_score?: number | null
          lifecycle_since?: string
          lifecycle_stage?: string
          momentum?: number | null
          split_pct?: number | null
          unique_wallets_24h?: number
          whale_activity_pct?: number | null
        }
        Update: {
          belief_id?: number
          buy_velocity_15m?: number
          buy_velocity_baseline?: number
          buy_volume_1h_usd?: number
          buy_volume_24h_usd?: number
          buy_volume_30d_usd?: number
          buy_volume_7d_usd?: number
          computed_at?: string
          delta_conviction_1h?: number | null
          distribution_gini?: number | null
          ignition_score?: number | null
          lifecycle_since?: string
          lifecycle_stage?: string
          momentum?: number | null
          split_pct?: number | null
          unique_wallets_24h?: number
          whale_activity_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "belief_stats_belief_id_fkey"
            columns: ["belief_id"]
            isOneToOne: true
            referencedRelation: "beliefs"
            referencedColumns: ["belief_id"]
          },
        ]
      }
      beliefs: {
        Row: {
          belief_id: number
          chain_id: number
          created_at: string
          created_block: number
          creation_log_index: number
          creation_tx_hash: string
          creator_address: string
          hydrated_at: string | null
          hydration_attempts: number
          is_ai_generated: boolean
          market_address: string
          raw_title_source: string | null
          title: string | null
        }
        Insert: {
          belief_id: number
          chain_id?: number
          created_at: string
          created_block: number
          creation_log_index: number
          creation_tx_hash: string
          creator_address: string
          hydrated_at?: string | null
          hydration_attempts?: number
          is_ai_generated?: boolean
          market_address: string
          raw_title_source?: string | null
          title?: string | null
        }
        Update: {
          belief_id?: number
          chain_id?: number
          created_at?: string
          created_block?: number
          creation_log_index?: number
          creation_tx_hash?: string
          creator_address?: string
          hydrated_at?: string | null
          hydration_attempts?: number
          is_ai_generated?: boolean
          market_address?: string
          raw_title_source?: string | null
          title?: string | null
        }
        Relationships: []
      }
      creators: {
        Row: {
          avg_market_volume_usd: number
          creator_address: string
          first_market_at: string
          markets_created: number
          quality_score: number | null
          retention_rate: number | null
          total_earned_usd: number
        }
        Insert: {
          avg_market_volume_usd?: number
          creator_address: string
          first_market_at: string
          markets_created?: number
          quality_score?: number | null
          retention_rate?: number | null
          total_earned_usd?: number
        }
        Update: {
          avg_market_volume_usd?: number
          creator_address?: string
          first_market_at?: string
          markets_created?: number
          quality_score?: number | null
          retention_rate?: number | null
          total_earned_usd?: number
        }
        Relationships: []
      }
      price_ticks: {
        Row: {
          block_timestamp: string
          source: string
          token: string
          usd_price: number
        }
        Insert: {
          block_timestamp: string
          source: string
          token: string
          usd_price: number
        }
        Update: {
          block_timestamp?: string
          source?: string
          token?: string
          usd_price?: number
        }
        Relationships: []
      }
      trades: {
        Row: {
          action: string
          belief_id: number
          block_number: number
          block_timestamp: string
          chain_id: number
          event_id: string
          gross_amount_native: number
          gross_amount_usd: number | null
          is_canonical: boolean
          is_confirmed: boolean
          log_index: number
          payment_token: string
          payment_token_symbol: string
          side: string
          tx_hash: string
          wallet_address: string
        }
        Insert: {
          action: string
          belief_id: number
          block_number: number
          block_timestamp: string
          chain_id?: number
          event_id: string
          gross_amount_native: number
          gross_amount_usd?: number | null
          is_canonical?: boolean
          is_confirmed?: boolean
          log_index: number
          payment_token: string
          payment_token_symbol: string
          side: string
          tx_hash: string
          wallet_address: string
        }
        Update: {
          action?: string
          belief_id?: number
          block_number?: number
          block_timestamp?: string
          chain_id?: number
          event_id?: string
          gross_amount_native?: number
          gross_amount_usd?: number | null
          is_canonical?: boolean
          is_confirmed?: boolean
          log_index?: number
          payment_token?: string
          payment_token_symbol?: string
          side?: string
          tx_hash?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_belief_id_fkey"
            columns: ["belief_id"]
            isOneToOne: false
            referencedRelation: "beliefs"
            referencedColumns: ["belief_id"]
          },
        ]
      }
      wallets: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          realized_pnl_usd: number | null
          tier: string
          total_volume_usd: number
          trade_count: number
          unique_beliefs_traded: number
          wallet_address: string
        }
        Insert: {
          first_seen_at: string
          last_seen_at: string
          realized_pnl_usd?: number | null
          tier?: string
          total_volume_usd?: number
          trade_count?: number
          unique_beliefs_traded?: number
          wallet_address: string
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          realized_pnl_usd?: number | null
          tier?: string
          total_volume_usd?: number
          trade_count?: number
          unique_beliefs_traded?: number
          wallet_address?: string
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
