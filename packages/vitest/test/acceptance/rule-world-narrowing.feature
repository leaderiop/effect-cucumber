Feature: Rule World narrowing — an audit tool whose Rules produce disjoint outputs

  Scenario: The Feature-level ambient service is visible outside every rule
    Then the feature id is "AUDIT-42"

  Rule: Remediation

    @REQ-EC-031
    Scenario: A narrowed Rule's step sees only its own reshaped world
      When the audit rule runs
      Then the remediation report reads "remediation-report for AUDIT-42"

  Rule: Bom

    Scenario: A sibling narrowed Rule sees only its own reshaped world
      When the audit rule runs
      Then the bom export reads "bom-export for AUDIT-42"
