import { render } from "@react-email/render";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Link,
  Preview,
} from "@react-email/components";
import type { Section as NewsletterSection } from "../pipeline/state.js";

interface NewsletterTemplateProps {
  newsletterName: string;
  subjectLine: string;
  previewText: string;
  sections: NewsletterSection[];
}

function NewsletterTemplate({
  newsletterName,
  previewText,
  sections,
}: NewsletterTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "24px" }}>
          {/* Header */}
          <Section style={{ backgroundColor: "#111827", padding: "24px", borderRadius: "8px 8px 0 0" }}>
            <Heading style={{ color: "#ffffff", margin: 0, fontSize: "22px" }}>
              {newsletterName}
            </Heading>
          </Section>

          {/* Sections */}
          {sections.map((section, i) => (
            <Section
              key={i}
              style={{ backgroundColor: "#ffffff", padding: "24px", borderBottom: "1px solid #e5e7eb" }}
            >
              <Text style={{ color: "#6b7280", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                {section.name}
              </Text>
              <Heading as="h2" style={{ fontSize: "18px", margin: "0 0 12px", color: "#111827" }}>
                {section.headline}
              </Heading>
              <Text style={{ color: "#374151", lineHeight: "1.6", margin: "0 0 16px" }}>
                {section.body}
              </Text>
              <Text style={{ backgroundColor: "#f3f4f6", padding: "12px", borderLeft: "3px solid #111827", color: "#374151", fontSize: "14px", margin: "0 0 16px" }}>
                <strong>Key takeaway:</strong> {section.key_takeaway}
              </Text>
              {section.sources.length > 0 && (
                <Text style={{ fontSize: "12px", color: "#9ca3af" }}>
                  Sources:{" "}
                  {section.sources.map((s, j) => (
                    <span key={j}>
                      <Link href={s.url} style={{ color: "#6b7280" }}>{s.title}</Link>
                      {j < section.sources.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </Text>
              )}
            </Section>
          ))}

          {/* Footer */}
          <Section style={{ backgroundColor: "#f3f4f6", padding: "16px", borderRadius: "0 0 8px 8px", textAlign: "center" as const }}>
            <Text style={{ color: "#9ca3af", fontSize: "12px", margin: 0 }}>
              {newsletterName} · Powered by Innovaas Solutions
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderNewsletterHTML(props: NewsletterTemplateProps): Promise<string> {
  return render(<NewsletterTemplate {...props} />);
}
