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
          market_cap_usd: number
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
          market_cap_usd?: number
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
          market_cap_usd?: number
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
            referencedRelation: "behavioral_grid"
            referencedColumns: ["belief_id"]
          },
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
      indexer_state: {
        Row: {
          chain_id: number
          last_error: string | null
          last_error_at: string | null
          last_indexed_at: string | null
          last_indexed_block: number
          updated_at: string
        }
        Insert: {
          chain_id: number
          last_error?: string | null
          last_error_at?: string | null
          last_indexed_at?: string | null
          last_indexed_block?: number
          updated_at?: string
        }
        Update: {
          chain_id?: number
          last_error?: string | null
          last_error_at?: string | null
          last_indexed_at?: string | null
          last_indexed_block?: number
          updated_at?: string
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
            referencedRelation: "behavioral_grid"
            referencedColumns: ["belief_id"]
          },
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
      behavioral_grid: {
        Row: {
          belief_id: number | null
          buy_volume_24h_usd: number | null
          created_at: string | null
          creator_address: string | null
          creator_quality: number | null
          delta_conviction_1h: number | null
          distribution_gini: number | null
          ignition_score: number | null
          lifecycle_stage: string | null
          momentum: number | null
          split_pct: number | null
          title: string | null
          unique_wallets_24h: number | null
          whale_activity_pct: number | null
        }
        Relationships: []
      }
      indexer_health: {
        Row: {
          chain_id: number | null
          last_error: string | null
          last_indexed_at: string | null
          last_indexed_block: number | null
        }
        Insert: {
          chain_id?: number | null
          last_error?: string | null
          last_indexed_at?: string | null
          last_indexed_block?: number | null
        }
        Update: {
          chain_id?: number | null
          last_error?: string | null
          last_indexed_at?: string | null
          last_indexed_block?: number | null
        }
        Relationships: []
      }
      live_activity_events: {
        Row: {
          action: string | null
          amount_usd: number | null
          belief_id: number | null
          belief_text: string | null
          block_number: number | null
          chain_id: number | null
          event_id: string | null
          event_timestamp: string | null
          event_type: string | null
          is_canonical: boolean | null
          is_confirmed: boolean | null
          log_index: number | null
          payment_token_symbol: string | null
          side: string | null
          tx_hash: string | null
          wallet_address: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activity_buckets: {
        Args: { buckets_back?: number; granularity?: string }
        Returns: {
          active_traders: number
          bucket: string
          buy_volume_eth: number
          buy_volume_usd: number
          buys: number
          created: number
          sells: number
        }[]
      }
      headline_metrics: {
        Args: { range_key: string }
        Returns: {
          active_traders: number
          active_traders_prev: number
          buy_volume_eth: number
          buy_volume_eth_prev: number
          buy_volume_usd: number
          buy_volume_usd_prev: number
          creator_revenue_eth: number
          creator_revenue_eth_prev: number
          creator_revenue_usd: number
          creator_revenue_usd_prev: number
          degen_allocation_eth: number
          degen_allocation_eth_prev: number
          degen_allocation_usd: number
          degen_allocation_usd_prev: number
          new_beliefs: number
          new_beliefs_prev: number
        }[]
      }
      hourly_activity: {
        Args: { hours_back?: number }
        Returns: {
          active_traders: number
          buy_volume_eth: number
          buy_volume_usd: number
          buys: number
          created: number
          hour: string
          sells: number
        }[]
      }
      refresh_belief_stats: { Args: never; Returns: undefined }
      repeat_wallet_rate: {
        Args: never
        Returns: {
          new_wallets: number
          repeat_rate: number
          repeat_wallets: number
        }[]
      }
      update_lifecycle_stages: { Args: never; Returns: undefined }
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
