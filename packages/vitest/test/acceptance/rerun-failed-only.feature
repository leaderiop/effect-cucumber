Feature: Rerun failed only

  @REQ-EC-030
  Scenario: A previously failing scenario reruns
    Given the rerun log records "A previously failing scenario reruns"
    Then the rerun log contains "A previously failing scenario reruns"

  Scenario: A previously passing scenario is filtered out at registration
    Given the rerun log records "A previously passing scenario is filtered out at registration"
    Then the rerun log contains "A previously passing scenario is filtered out at registration"
