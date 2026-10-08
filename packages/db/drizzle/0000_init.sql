CREATE TYPE "public"."race" AS ENUM('5k', '10k', '21k', '42k');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."shirt_size" AS ENUM('XS', 'S', 'M', 'L', 'XL', '2XL');--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"race" "race" NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"mobile" text NOT NULL,
	"birthdate" date NOT NULL,
	"sex" "sex" NOT NULL,
	"shirt_size" "shirt_size" NOT NULL,
	"emergency_contact_name" text NOT NULL,
	"emergency_contact_mobile" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"amount_centavos" integer NOT NULL,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"checkout_session_id" text,
	"payment_id" text,
	"payment_method" text,
	"fee_centavos" integer,
	"net_centavos" integer,
	"paid_at" timestamp with time zone,
	"confirmation_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_reference_unique" UNIQUE("reference"),
	CONSTRAINT "registrations_checkout_session_id_unique" UNIQUE("checkout_session_id"),
	CONSTRAINT "registrations_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "registrations_amount_positive" CHECK ("registrations"."amount_centavos" > 0),
	CONSTRAINT "registrations_paid_has_paid_at" CHECK ("registrations"."status" <> 'paid' OR "registrations"."paid_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "registrations_status_idx" ON "registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registrations_race_idx" ON "registrations" USING btree ("race");--> statement-breakpoint
CREATE INDEX "registrations_created_at_idx" ON "registrations" USING btree ("created_at");