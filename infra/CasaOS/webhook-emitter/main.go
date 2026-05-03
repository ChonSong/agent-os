package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	webhookURL       string
	webhookAuth      string
	pollIntervalSec  int
	containerFilter  string
)

func main() {
	root := &cobra.Command{Use: "webhook-emitter"}
	root.PersistentFlags().StringVar(&webhookURL, "webhook-url", "", "URL to POST events to (required)")
	root.PersistentFlags().StringVar(&webhookAuth, "webhook-auth", "", "Authorization header value")
	root.PersistentFlags().IntVar(&pollIntervalSec, "poll-interval", 10, "Poll interval in seconds")
	root.PersistentFlags().StringVar(&containerFilter, "filter", "", "Container name prefix filter")

	root.AddCommand(&cobra.Command{
		Use:   "run",
		Short: "Start polling and emitting webhooks",
		RunE:  runEmitter,
	})

	if err := root.Execute(); err != nil {
		log.Fatal(err)
	}
}

type ContainerEvent struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Image     string `json:"image"`
	Timestamp string `json:"timestamp"`
	State     string `json:"state"`
}

type Container struct {
	Name  string
	State string
	Image string
}

func runEmitter(cmd *cobra.Command, args []string) error {
	if webhookURL == "" {
		return fmt.Errorf("--webhook-url is required")
	}
	ticker := time.NewTicker(time.Duration(pollIntervalSec) * time.Second)
	defer ticker.Stop()

	known := map[string]string{}

	for {
		<-ticker.C
		containers, err := getContainers()
		if err != nil {
			log.Printf("poll error: %v", err)
			continue
		}

		for _, c := range containers {
			if containerFilter != "" && !strings.HasPrefix(c.Name, containerFilter) {
				continue
			}
			prev, seen := known[c.Name]
			if !seen || prev != c.State {
				event := ContainerEvent{
					Type:      "container_state_change",
					Name:      c.Name,
					Image:     c.Image,
					State:     c.State,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
				}
				if err := sendWebhook(event); err != nil {
					log.Printf("webhook error for %s: %v", c.Name, err)
				} else {
					prevState := "<new>"
					if seen {
						prevState = prev
					}
					log.Printf("event: %s %s -> %s", c.Name, prevState, c.State)
				}
				known[c.Name] = c.State
			}
		}
	}
}

func getContainers() ([]Container, error) {
	out, err := exec.Command("docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}\t{{.Image}}").CombinedOutput()
	if err != nil {
		return nil, err
	}
	var result []Container
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) == 3 {
			result = append(result, Container{Name: parts[0], State: parts[1], Image: parts[2]})
		}
	}
	return result, nil
}

func sendWebhook(event ContainerEvent) error {
	b, _ := json.Marshal(event)
	req, _ := http.NewRequest("POST", webhookURL, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if webhookAuth != "" {
		req.Header.Set("Authorization", webhookAuth)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}
