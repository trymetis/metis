import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { config } from "@/config";

import { EMAIL_FONT_PATH } from "./font";

export interface MetisSuiteDetail {
  label: string;
  value: string;
}

export interface MetisSuiteTemplateProps {
  preview: string;
  heading: string;
  intro?: string;
  children?: React.ReactNode;
  details?: MetisSuiteDetail[];
  buttonLabel: string;
  url: string;
  expiry?: string;
  footer?: string;
}

const FONT_URL = new URL(EMAIL_FONT_PATH, config.auth.url).toString();

const FONT_STACK =
  "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const INK = "#0a0a0a";
const TEXT = "#404040";
const MUTED = "#737373";
const LINE = "#e5e5e5";

const darkRules = `
    .m-body { background-color: #0a0a0a !important; }
    .m-ink { color: #fafafa !important; }
    .m-text { color: #d4d4d4 !important; }
    .m-muted { color: #a3a3a3 !important; }
    .m-line { border-color: #262626 !important; }
    .m-button { background-color: #fafafa !important; color: #0a0a0a !important; }
`;

const colorSchemeCss = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {${darkRules}  }
  ${darkRules
    .trim()
    .split("\n")
    .map((rule) => `[data-ogsc] ${rule.trim()}`)
    .join("\n  ")}
`;

const bodyStyle: React.CSSProperties = {
  margin: 0,
  padding: "48px 20px",
  backgroundColor: "#ffffff",
  color: INK,
  fontFamily: FONT_STACK,
  WebkitFontSmoothing: "antialiased",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "460px",
  margin: "0 auto",
};

const wordmarkStyle: React.CSSProperties = {
  margin: "0 0 40px",
  fontSize: "14px",
  lineHeight: "20px",
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: INK,
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: "22px",
  lineHeight: "30px",
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: INK,
};

const introStyle: React.CSSProperties = {
  margin: "0 0 28px",
  fontSize: "15px",
  lineHeight: "24px",
  color: TEXT,
};

const detailsStyle: React.CSSProperties = {
  margin: "0 0 28px",
  borderTop: `1px solid ${LINE}`,
};

const detailCellStyle: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: `1px solid ${LINE}`,
  fontSize: "13px",
  lineHeight: "20px",
  verticalAlign: "top",
};

const detailLabelStyle: React.CSSProperties = {
  ...detailCellStyle,
  width: "112px",
  paddingRight: "16px",
  color: MUTED,
};

const detailValueStyle: React.CSSProperties = {
  ...detailCellStyle,
  color: INK,
  wordBreak: "break-word",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 20px",
  borderRadius: "8px",
  backgroundColor: INK,
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "20px",
  fontWeight: 500,
  textDecoration: "none",
  boxSizing: "border-box",
};

const expiryStyle: React.CSSProperties = {
  margin: "16px 0 0",
  fontSize: "13px",
  lineHeight: "20px",
  color: MUTED,
};

const fallbackStyle: React.CSSProperties = {
  margin: "32px 0 0",
  fontSize: "13px",
  lineHeight: "20px",
  color: MUTED,
};

const urlStyle: React.CSSProperties = {
  color: TEXT,
  wordBreak: "break-all",
};

const dividerStyle: React.CSSProperties = {
  margin: "40px 0 20px",
  border: "none",
  borderTop: `1px solid ${LINE}`,
};

const footerStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  lineHeight: "18px",
  color: MUTED,
};

const addressStyle: React.CSSProperties = {
  ...footerStyle,
  margin: "8px 0 0",
  fontSize: "11px",
};

export function MetisSuiteTemplate({
  preview,
  heading,
  intro,
  children,
  details,
  buttonLabel,
  url,
  expiry,
  footer = "Didn't request this email? You can safely ignore it.",
}: MetisSuiteTemplateProps) {
  return (
    <Html lang="en">
      <Head>
        <title>{heading}</title>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <Font
          fontFamily="DM Sans"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          webFont={{ url: FONT_URL, format: "woff2" }}
          fontWeight="100 1000"
        />
        {/* oxlint-disable-next-line react/no-danger --static stylesheet, no interpolation */}
        <style dangerouslySetInnerHTML={{ __html: colorSchemeCss }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle} className="m-body">
        <Container style={containerStyle}>
          <Text style={wordmarkStyle} className="m-ink">
            Metis Suite
          </Text>

          <Heading as="h1" style={headingStyle} className="m-ink">
            {heading}
          </Heading>

          {intro ? (
            <Text style={introStyle} className="m-text">
              {intro}
            </Text>
          ) : null}
          {children}

          {details?.length ? (
            <Section style={detailsStyle} className="m-line">
              {details.map((detail) => (
                <Row key={detail.label}>
                  <Column style={detailLabelStyle} className="m-muted m-line">
                    {detail.label}
                  </Column>
                  <Column style={detailValueStyle} className="m-ink m-line">
                    {detail.value}
                  </Column>
                </Row>
              ))}
            </Section>
          ) : null}

          <Button href={url} style={buttonStyle} className="m-button">
            {buttonLabel}
          </Button>

          {expiry ? (
            <Text style={expiryStyle} className="m-muted">
              {expiry}
            </Text>
          ) : null}

          <Text style={fallbackStyle} className="m-muted" data-skip-in-text="true">
            Or paste this link into your browser:
            <br />
            <span style={urlStyle} className="m-text">
              {url}
            </span>
          </Text>

          <Hr style={dividerStyle} className="m-line" />

          <Text style={footerStyle} className="m-muted">
            {footer}
          </Text>
          <Text style={addressStyle} className="m-muted">
            AstraQ Cyber Defence Pvt. Ltd. · Engineers Colony, Mothi Umari, Jatherpeth, Akola,
            Maharashtra, India 444005
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
