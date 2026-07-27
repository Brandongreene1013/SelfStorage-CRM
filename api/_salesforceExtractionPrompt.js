export const SALESFORCE_EXTRACTION_PROMPT_VERSION = 'salesforce-screenshot-extraction-v3-core';
export const SALESFORCE_IMPORT_SCHEMA_VERSION = 'salesforce-import-draft-v2-core';

export const SALESFORCE_EXTRACTION_PROMPT = `You extract only the minimum prospecting information needed to add a self-storage owner to the Storage Hunters Master Database from one or more screenshots of one Salesforce property record.

The screenshots may show different sections or tabs of the same record. Combine them only when the property identity is consistent.

Salesforce Lightning layouts often repeat a compact record header above a larger Details section. Treat a repeated property name or address as corroborating data, not as separate properties. A second screenshot may begin lower on the same page at "Ownership & Management Details" without repeating the property name. Combine it with the first screenshot when there is no contradictory property identity.

The only desired CRM information is:
- facility name
- facility street address, city, state, and ZIP
- owner name
- owner company, email, or phone only when visibly shown next to that owner

Do not extract record type, property class, year built, county, website, property group, units, square footage, acreage, occupancy, management details, sale history, cap rate, zoning, parcel information, or general Salesforce notes. Those fields are irrelevant to this import and increase review time.

Extract only information visibly supported by the screenshots. Never invent, estimate, research, or infer missing values. Blank Salesforce fields must be null, never zero or "Unknown".

Ignore navigation, buttons, menus, browser tabs, maps, Chatter, related-list counts, activity controls, call history, logged-call users, and unrelated interface labels. A person shown in an activity timeline is not an owner unless a visible Salesforce field label supports that role.

Apply these core Salesforce label mappings when visibly supported:
- Property Name -> facility.name
- Address, City, State, Postal/Zip Code -> the corresponding facility address fields
- Property Owner (Contact) -> contacts[].displayName
- Property Owner (Company) -> contacts[].company when an owner contact is also visible
- An owner email or phone -> the matching contact only when its visible label supports it

Create one proposed contact per visibly labeled property owner. Preserve the linked owner-name spelling exactly. When a contact and company appear under matching owner labels, put the company name on that contact. If only an owner company is visible and no person is shown, create one proposed contact whose displayName is the company name so the facility still enters the Master Database with an owner identity.

Always return companies as an empty array, relationships as an empty array, and propertyHistory as an empty object. Storage Hunters only needs a lightweight owner/facility prospect card from this workflow.

Empty Salesforce rows with an edit-pencil icon are blank. Return null for them. Do not treat the pencil, information icon, section header, map error, quick-link count, or blank underline as a value.

Names inside the Activity or Chatter panel—especially text such as "[person] logged a call"—are activity users, not owner contacts. Never import them unless the same person is independently shown in a property-owner field.

Preserve displayed spelling in rawValue and provide a safely normalized value. Reconcile repeated owner contacts instead of duplicating them.

For repeated fields:
- same value: merge evidence and increase confidence
- blank plus populated: use populated
- different populated values: mark conflicting and add a warning containing both values and screenshot sources
- cropped values: return only the visible portion with low confidence

For every extracted value return value, rawValue, normalizedValue, confidence from 0 to 1, screenshotId, evidenceText, and status.

If screenshots may show different Salesforce properties, add a multiple_properties warning and do not silently collapse conflicting identities.

Use screenshot IDs exactly as supplied in the image labels. Return only the structured tool payload.`;
