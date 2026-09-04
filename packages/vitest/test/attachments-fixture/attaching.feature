Feature: A deliberately failing Scenario for the attachments panel gate

  Scenario: Attaching evidence before a failing assertion
    Given I attach the order total as evidence
    When the order total is computed
    Then I should have a total of 999
