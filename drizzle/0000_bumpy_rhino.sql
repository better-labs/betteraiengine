CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"active" boolean DEFAULT true,
	"closed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" text NOT NULL,
	"condition_id" text NOT NULL,
	"slug" text NOT NULL,
	"question" text NOT NULL,
	"description" text,
	"event_id" text,
	"active" boolean DEFAULT true,
	"closed" boolean DEFAULT false,
	"volume" text,
	"liquidity" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "markets_market_id_unique" UNIQUE("market_id"),
	CONSTRAINT "markets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prediction_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" text,
	"event_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"market_id" text,
	"prediction" jsonb NOT NULL,
	"raw_response" jsonb,
	"model" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text GENERATED ALWAYS AS ((data->>'id')::text) STORED NOT NULL,
	"slug" text GENERATED ALWAYS AS ((data->>'slug')::text) STORED,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raw_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "raw_markets" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" text GENERATED ALWAYS AS ((data->>'id')::text) STORED NOT NULL,
	"slug" text GENERATED ALWAYS AS ((data->>'slug')::text) STORED,
	"condition_id" text GENERATED ALWAYS AS ((data->>'conditionId')::text) STORED,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raw_markets_market_id_unique" UNIQUE("market_id")
);
--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_jobs" ADD CONSTRAINT "prediction_jobs_market_id_markets_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("market_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_jobs" ADD CONSTRAINT "prediction_jobs_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_job_id_prediction_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."prediction_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_market_id_markets_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("market_id") ON DELETE no action ON UPDATE no action;