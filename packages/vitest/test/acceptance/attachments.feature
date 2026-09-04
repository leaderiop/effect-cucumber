Feature: Attachments — evidence attached from a step or a per-Scenario hook

  @REQ-EC-028
  Scenario: The first scenario's Before, BeforeStep, step and AfterStep attach evidence
    When the scenario attaches "one"
    Then the attachment log so far reads "Before,BeforeStep,attach:one,AfterStep,BeforeStep" with "After" logged 0 time

  Scenario: The second scenario's own Before observes the first scenario's After
    When the scenario attaches "two"
    Then the attachment log so far reads "Before,BeforeStep,attach:one,AfterStep,BeforeStep,read,AfterStep,After,Before,BeforeStep,attach:two,AfterStep,BeforeStep" with "After" logged 1 time
