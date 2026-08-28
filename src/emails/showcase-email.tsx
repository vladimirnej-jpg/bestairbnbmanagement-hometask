import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import type { ShowcaseContent } from './showcase-email.types';

export function ShowcaseEmail({
  content,
}: {
  readonly content: ShowcaseContent;
}): React.JSX.Element {
  return (
    <Html lang="en">
      <Head />
      <Preview>{content.subject}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading as="h1" style={headingStyle}>
            Your property showcase
          </Heading>
          <Text>{content.greeting}</Text>
          <Text>{content.propertySummary}</Text>
          {content.masterDataWarning === undefined ? null : (
            <Text style={warningStyle}>{content.masterDataWarning}</Text>
          )}
          <Section style={sectionStyle}>
            <Heading as="h2" style={subheadingStyle}>
              Recommended services
            </Heading>
            {content.selectedServices.map((service) => (
              <Text key={service} style={listItemStyle}>
                - {service}
              </Text>
            ))}
          </Section>
          <Section style={sectionStyle}>
            <Heading as="h2" style={subheadingStyle}>
              What we know
            </Heading>
            {content.observations.map((observation) => (
              <Text key={observation} style={listItemStyle}>
                - {observation}
              </Text>
            ))}
          </Section>
          <Button href="mailto:sales@bestairbnb.example" style={buttonStyle}>
            {content.callToAction}
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = { backgroundColor: '#f6f7fb', color: '#182230', fontFamily: 'Arial, sans-serif' };
const containerStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  margin: '32px auto',
  maxWidth: '600px',
  padding: '32px',
};
const headingStyle = { fontSize: '26px', lineHeight: '32px', margin: '0 0 20px' };
const subheadingStyle = { fontSize: '18px', lineHeight: '24px', margin: '0 0 8px' };
const sectionStyle = { margin: '24px 0' };
const listItemStyle = { margin: '6px 0' };
const warningStyle = {
  backgroundColor: '#fff7e6',
  borderRadius: '6px',
  color: '#7a4b00',
  padding: '12px',
};
const buttonStyle = {
  backgroundColor: '#155eef',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  padding: '12px 18px',
  textDecoration: 'none',
};
