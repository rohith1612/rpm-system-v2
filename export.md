# Cerner Millennium SMART on FHIR Integration Guide for RPM

This document serves as a comprehensive guide for integrating a Remote Patient Monitoring (RPM) system with Cerner Millennium via the SMART on FHIR standard. It covers authentication, payload construction, specific LOINC codes/UCUM units that work in the Cerner sandbox, and advanced batching methods (Transaction Bundles).

---

## 1. SMART on FHIR Authentication & Credentials

To interact with Cerner Millennium, you must register a SMART on FHIR application in the [Cerner code console](https://code.cerner.com/). 

### Required Configuration
* **Client ID:** A unique identifier provided by Cerner when you register your app.
* **App Type:** Provider / Standalone.
* **Launch URI:** The URL where Cerner redirects the user to begin the launch sequence (e.g., `http://localhost:5173/launch`).
* **Redirect URI:** The URL where Cerner sends the OAuth 2.0 authorization code (e.g., `http://localhost:5173/`).
* **FHIR Version:** R4.
* **Scopes:** You must request precise scopes for the resources you intend to read/write. For an RPM system, you need:
  * `launch/patient` (context)
  * `openid fhirUser` (identity)
  * `patient/Patient.read` (demographics)
  * `patient/Observation.read` (reading vitals)
  * `patient/Observation.write` (writing vitals)
  * `patient/Condition.read` (reading conditions)
  * `online_access` (maintaining the session)

### Authentication Flow (OAuth 2.0 Authorization Code)
1. **Launch:** The app receives a `launch` token and an `iss` (FHIR Server URL) parameter from Cerner.
2. **Authorize:** The app redirects the user to Cerner's authorization endpoint, passing the `client_id`, `scope`, `redirect_uri`, `launch`, and `aud` (the `iss` URL).
3. **Login:** The provider logs into Cerner and selects a patient.
4. **Callback:** Cerner redirects back to your `redirect_uri` with a `code`.
5. **Token Exchange:** The app exchanges the `code` for an `access_token` and `patient` ID at Cerner's token endpoint.
6. **API Calls:** Use the `access_token` as a Bearer token in the `Authorization` header for all FHIR requests.

---

## 2. Vital Signs Configuration (LOINC & UCUM)

Cerner R4 sandbox is extremely strict regarding LOINC codes and UCUM units for writing `Observation` resources. Abstract codes (e.g., generic SpO2 or generic heart rate) are often rejected with `422 Unprocessable Entity`. 

Here are the specific, tested codes and units that successfully post to Cerner Millennium:

| Vital Sign | LOINC Code | Display | Unit (Display) | UCUM Unit Code | Value Type |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Heart Rate** | `69000-8` | Heart rate | beats/minute | `{Beats}/min` | Integer/Decimal |
| **Respiratory Rate** | `9279-1` | Respiratory rate | /min | `{Breaths}/min` | Integer/Decimal |
| **Oral Temperature**| `8331-1` | Oral temperature | degC | `Cel` | Decimal |
| **SpO2** | `59418-4` | SpO2 | % | `%` | Integer/Decimal |
| **Blood Pressure** | `85354-9` | Blood pressure | N/A (Panel) | N/A | Component Panel |

---

## 3. Current Working Payload Formats

### A. Single Observation (e.g., Heart Rate)
When sending a single vital sign, use the base `Observation` resource.

**POST Endpoint:** `[FHIR_BASE_URL]/Observation`

```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs",
          "display": "Vital Signs"
        }
      ],
      "text": "Vital Signs"
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "69000-8",
        "display": "Heart rate"
      }
    ]
  },
  "subject": {
    "reference": "Patient/12742400"
  },
  "effectiveDateTime": "2026-06-25T12:00:00Z",
  "valueQuantity": {
    "value": 75,
    "unit": "beats/minute",
    "system": "http://unitsofmeasure.org",
    "code": "{Beats}/min"
  }
}
```

### B. Multi-Component Observation (Blood Pressure Panel)
Blood pressure requires a panel structure using the `component` array, representing Systolic (`8480-6`) and Diastolic (`8462-4`).

**POST Endpoint:** `[FHIR_BASE_URL]/Observation`

```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs",
          "display": "Vital Signs"
        }
      ],
      "text": "Vital Signs"
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "85354-9",
        "display": "Blood pressure panel with all children optional"
      }
    ]
  },
  "subject": {
    "reference": "Patient/12742400"
  },
  "effectiveDateTime": "2026-06-25T12:00:00Z",
  "component": [
    {
      "code": {
        "coding": [
          {
            "system": "http://loinc.org",
            "code": "8480-6",
            "display": "Systolic blood pressure"
          }
        ]
      },
      "valueQuantity": {
        "value": 120,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]"
      }
    },
    {
      "code": {
        "coding": [
          {
            "system": "http://loinc.org",
            "code": "8462-4",
            "display": "Diastolic blood pressure"
          }
        ]
      },
      "valueQuantity": {
        "value": 80,
        "unit": "mmHg",
        "system": "http://unitsofmeasure.org",
        "code": "mm[Hg]"
      }
    }
  ]
}
```

---

## 4. Suggested Optimization: The Bundle Method (Transaction)

Currently, the system iterates over the user's input and sends a separate `POST /Observation` request for every vital sign. For a monitoring system that regularly pushes arrays of data (e.g., HR, SpO2, and Temp simultaneously), you can drastically reduce network latency and API rate-limiting by using a FHIR **Transaction Bundle**.

A Transaction Bundle allows you to send multiple resources in a single HTTP request. Cerner will process all of them, and if any fail, the entire transaction rolls back, ensuring data consistency.

**POST Endpoint:** `[FHIR_BASE_URL]/` (Post to the root of the FHIR server, not to `/Observation`)

### Bundle Payload Example
```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "vital-signs"
              }
            ]
          }
        ],
        "code": {
          "coding": [
            {
              "system": "http://loinc.org",
              "code": "69000-8",
              "display": "Heart rate"
            }
          ]
        },
        "subject": { "reference": "Patient/12742400" },
        "effectiveDateTime": "2026-06-25T12:00:00Z",
        "valueQuantity": {
          "value": 82,
          "unit": "beats/minute",
          "system": "http://unitsofmeasure.org",
          "code": "{Beats}/min"
        }
      },
      "request": {
        "method": "POST",
        "url": "Observation"
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "category": [
          {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "vital-signs"
              }
            ]
          }
        ],
        "code": {
          "coding": [
            {
              "system": "http://loinc.org",
              "code": "8331-1",
              "display": "Oral temperature"
            }
          ]
        },
        "subject": { "reference": "Patient/12742400" },
        "effectiveDateTime": "2026-06-25T12:00:00Z",
        "valueQuantity": {
          "value": 37.2,
          "unit": "degC",
          "system": "http://unitsofmeasure.org",
          "code": "Cel"
        }
      },
      "request": {
        "method": "POST",
        "url": "Observation"
      }
    }
  ]
}
```

### Why use Bundles for RPM?
1. **Performance:** Sending 5 vitals at once takes 1 network trip instead of 5.
2. **Atomicity:** Ensures that if a patient record is locked or an error occurs, you don't get partial data uploads (e.g., HR uploads but SpO2 fails).
3. **Rate Limits:** Cerner (and most EHRs) impose API rate limits. Bundling dramatically reduces the number of API calls made per patient.
